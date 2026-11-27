package cn.inkwords;

import android.app.job.*;
import android.content.*;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import org.json.JSONObject;
import java.util.concurrent.*;

public class LookupJob extends JobService {
    static final ExecutorService LOCAL=Executors.newSingleThreadExecutor(), NET=Executors.newSingleThreadExecutor();
    static final ExecutorService EXAMPLES=Executors.newSingleThreadExecutor();
    static final Handler MAIN=new Handler(Looper.getMainLooper());
    static volatile Runnable changed;
    private static final int JOB_ID=38121;
    private static boolean running;
    private volatile Object activeRun;
    static void notifyChange(){MAIN.post(()->{Runnable listener=changed;if(listener!=null)listener.run();});}
    static void local(Context context){
        Context app=context.getApplicationContext();
        LOCAL.execute(()->{
            WordStore store=WordStore.get(app);boolean updated=false;
            try {
                JSONObject w;
                while((w=store.next("local",Long.MAX_VALUE))!=null){
                    JSONObject result=Dictionary.local(app,w.getString("raw"));
                    store.resolved(w.getString("id"),"local",result);updated=true;
                }
            }catch(Exception ex){Log.e("InkWords","本地查词失败",ex);}
            if(updated)notifyChange();
            schedule(app);
        });
    }
    static synchronized void schedule(Context app){
        if(running)return;
        JobScheduler scheduler=app.getSystemService(JobScheduler.class);
        long first=WordStore.get(app).pendingTime();
        if(first<0)return;
        long delay=Math.max(0,first-System.currentTimeMillis());
        JobInfo current=scheduler.getPendingJob(JOB_ID);
        if(current!=null && current.getExtras().getLong("first")<=first)return;
        android.os.PersistableBundle extras=new android.os.PersistableBundle(); extras.putLong("first",first);
        JobInfo info=new JobInfo.Builder(JOB_ID,new ComponentName(app,LookupJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(delay).setExtras(extras)
                .setPersisted(true).build();scheduler.schedule(info);
    }
    @Override public boolean onStartJob(JobParameters params){
        Object run=new Object();
        synchronized(LookupJob.class){activeRun=run;running=true;}
        NET.execute(()->{
            WordStore store=WordStore.get(this);
            try{
                for(int i=0;i<20&&activeRun==run;i++){
                    JSONObject w=store.next("pending",System.currentTimeMillis());if(w==null)break;
                    JSONObject result=null;
                    try{result=Dictionary.online(w.getString("raw"));}catch(Exception ex){Log.i("InkWords","网络查词稍后重试");}
                    if(activeRun!=run)break;
                    store.resolved(w.getString("id"),"pending",result);notifyChange();
                }
            }catch(Exception ex){Log.e("InkWords","处理队列失败",ex);}
            MAIN.post(()->{
                synchronized(LookupJob.class){if(activeRun!=run)return;activeRun=null;running=false;}
                jobFinished(params,false);LOCAL.execute(()->schedule(this));
            });
        });return true;
    }
    @Override public boolean onStopJob(JobParameters params){synchronized(LookupJob.class){activeRun=null;running=false;}return true;}
}
