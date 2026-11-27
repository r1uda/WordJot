package cn.inkwords;

import android.app.*;
import android.content.Context;
import android.os.Bundle;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** Run on a fresh debug installation. Never operates on the release package. */
public final class DeviceChecks extends Instrumentation {
    private final ArrayList<String> passed=new ArrayList<>();
    private boolean speechOnly;
    private void check(String name,boolean condition){
        if(!condition)throw new AssertionError(name);passed.add(name);
    }
    @Override public void onCreate(Bundle args){super.onCreate(args);speechOnly=args!=null&&"speech".equals(args.getString("suite"));start();}
    @Override public void onStart(){
        Bundle report=new Bundle();boolean success=false;
        try{
            Context ctx=getTargetContext();
            if(!ctx.getPackageName().endsWith(".debug"))throw new IllegalStateException("Requires debug package");
            if(speechOnly){
                check("offline English speech produces PCM audio",SpeechCheck.run(ctx));
                report.putString("stream","PASS offline English speech produces PCM audio\n");
                finish(Activity.RESULT_OK,report);return;
            }
            WordStore store=WordStore.get(ctx);
            if(store.words().length()!=0)throw new IllegalStateException("Use a new debug test installation");
            JSONObject apple=Dictionary.local(ctx,"apple");
            check("offline English definition and IPA",apple.getString("zh").contains("苹果")&&!apple.getString("ipa").isEmpty());
            check("Chinese primary gloss",Dictionary.local(ctx,"大学生").getString("en").contains("student"));
            check("offline English phrase",Dictionary.local(ctx,"look up").getString("zh").length()>0);
            String id=store.capture("  Apple ").getString("id");
            check("case and whitespace deduplication",store.capture("APPLE").getBoolean("duplicate"));
            ExecutorService ex=Executors.newFixedThreadPool(4);ArrayList<Future<JSONObject>> jobs=new ArrayList<>();
            for(int i=0;i<16;i++)jobs.add(ex.submit(()->store.capture("apple")));
            for(Future<JSONObject> f:jobs)if(!f.get().getBoolean("duplicate"))throw new AssertionError("concurrent duplicate");
            ex.shutdown();check("16 concurrent captures",store.words().length()==1);
            store.resolved(id,"local",apple);
            String cn=store.capture("苹果").getString("id");
            store.resolved(cn,"local",Dictionary.local(ctx,"苹果"));
            check("bidirectional word merge and alias",store.words().length()==1&&store.capture("苹果").getBoolean("duplicate"));
            String unknown=store.capture("inkwords classroom phrase qzx").getString("id");
            store.resolved(unknown,"local",null);
            check("persistent pending queue",store.next("pending",System.currentTimeMillis()).getString("id").equals(unknown));
            store.resolved(unknown,"pending",null);
            check("network backoff",store.next("pending",System.currentTimeMillis())==null&&store.pendingTime()>System.currentTimeMillis());
            store.resetRetries();check("manual retry",store.pendingTime()==0);
            JSONObject edited=store.word(unknown).put("en","inkwords classroom phrase qzx").put("zh","课堂词组").put("category","英语课");
            store.edit(edited);store.resolved(unknown,"pending",new JSONObject().put("en","late result").put("zh","迟到结果"));
            check("manual edit survives late response",store.word(unknown).getString("zh").equals("课堂词组"));
            store.favorite(id);
            JSONObject wrong=store.grade(id,0,"test","event1");
            check("wrong word captured",wrong.getBoolean("mistake")&&wrong.getInt("wrong")==1);
            store.grade(id,0,"test","event1");
            check("grade retry idempotent",store.word(id).getInt("wrong")==1);
            JSONObject right=store.grade(id,2,"test","event2");
            check("correct answer clears mistake",!right.getBoolean("mistake")&&right.getInt("right")==1);
            JSONObject master=store.grade(id,3,"review","event3");
            check("mastery and interval",master.getInt("level")==4&&master.getLong("due")>master.getLong("last")+86400000L);
            check("daily aggregation and recent events",store.snapshot().getJSONArray("days").getJSONArray(0).getInt(1)==3&&store.snapshot().getJSONArray("recent").length()==3);
            JSONObject file=new JSONObject(store.backup().toString());
            store.delete(id);store.delete(unknown);
            check("delete cascades",store.snapshot().getJSONArray("recent").length()==0);
            check("JSON restore",store.restore(file)==2&&store.word(id).getBoolean("favorite")&&store.backup().getJSONArray("events").length()==3);
            check("duplicate import stable",store.restore(file)==0&&store.word(id).getInt("right")==2);
            store.delete(id);store.delete(unknown);
            JSONObject bad=new JSONObject(file.toString());bad.getJSONArray("words").getJSONObject(1).put("level",-3);
            try{store.restore(bad);}catch(Exception expectedFailure){}
            check("bad backup rolls back all changes",store.words().length()==0);
            success=true;
        }catch(Throwable t){report.putString("failure",android.util.Log.getStackTraceString(t));}
        report.putString("stream","\n"+String.join("\nPASS ",passed)+"\n"+(success?"ALL DEVICE CHECKS PASSED":report.getString("failure"))+"\n");
        finish(success?Activity.RESULT_OK:Activity.RESULT_CANCELED,report);
    }
}
