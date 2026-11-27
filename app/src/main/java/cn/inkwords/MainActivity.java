package cn.inkwords;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.speech.tts.*;
import android.view.*;
import android.webkit.*;
import android.widget.Toast;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private WebView web;
    private WordStore store;
    private TextToSpeech tts;
    private volatile boolean voiceReady;
    private boolean classroom, dark, loaded;
    private int voiceGeneration;
    private static final ExecutorService IO=Executors.newSingleThreadExecutor();
    private static final ExecutorService SEARCH=Executors.newFixedThreadPool(2);
    private final Runnable onChange=()->js("window.dataChanged && window.dataChanged()");
    private String fileRequest;
    private final Map<String,Long> exampleRequests=new HashMap<>();
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        store=WordStore.get(this);
        web=new WebView(this);
        web.setBackgroundColor(Color.rgb(246,247,241));
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setTextZoom(100);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest req){
                Uri u=req.getUrl();String path=u.getPath();
                if("https".equals(u.getScheme()) && "inkwords.invalid".equals(u.getHost())
                        && path!=null && path.matches("/[A-Za-z0-9_-]+\\.(html|css|js)")){
                    String type=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":"text/html";
                    try{return new WebResourceResponse(type,"UTF-8",getAssets().open("ui"+path));}catch(IOException ignored){}
                }
                return new WebResourceResponse("text/plain","UTF-8",404,"Missing",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView v,String url){loaded=true;}
        });
        web.addJavascriptInterface(new Bridge(),"Ink");
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)
            WebView.setWebContentsDebuggingEnabled(true);
        setContentView(web);bars();
        web.loadUrl("https://inkwords.invalid/index.html");
    }
    private void prepareSpeech(){
        int generation=++voiceGeneration;
        if(tts!=null)tts.shutdown();
        tts=new TextToSpeech(this,status->{
            if(status!=TextToSpeech.SUCCESS||tts==null||generation!=voiceGeneration)return;
            voiceReady=tts.setLanguage(Locale.US)>=TextToSpeech.LANG_AVAILABLE;
            if(voiceReady && tts.getVoices()!=null)
                for(Voice v:tts.getVoices())if(v.getLocale().equals(Locale.US)&&!v.isNetworkConnectionRequired()
                        && (v.getFeatures()==null||!v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))){tts.setVoice(v);break;}
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                public void onStart(String id){} public void onDone(String id){android.util.Log.d("InkWordsSpeech","Utterance completed");}
                public void onError(String id){runOnUiThread(()->Toast.makeText(MainActivity.this,"朗读失败，请检查系统英文语音包",Toast.LENGTH_SHORT).show());}
            });
        });
    }
    @Override protected void onResume(){super.onResume();if(!voiceReady)prepareSpeech();LookupJob.changed=onChange;LookupJob.local(this);if(loaded)onChange.run();}
    @Override protected void onPause(){super.onPause();if(tts!=null)tts.stop();}
    @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);js("window.applyTheme && window.applyTheme()");}
    @Override protected void onDestroy(){voiceGeneration++;if(LookupJob.changed==onChange)LookupJob.changed=null;if(tts!=null)tts.shutdown();web.removeJavascriptInterface("Ink");web.destroy();super.onDestroy();}
    @Override public void onBackPressed(){
        web.evaluateJavascript("window.goBack ? window.goBack() : false",value->{if(!"true".equals(value))super.onBackPressed();});
    }
    private void js(String s){if(!isDestroyed())web.evaluateJavascript(s,null);}
    private void bars(){
        Window w=getWindow();int color=classroom?Color.BLACK:dark?Color.rgb(22,29,25):Color.rgb(247,248,242);
        w.setStatusBarColor(color);w.setNavigationBarColor(color);
        int flags=classroom?(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY):
                dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        w.getDecorView().setSystemUiVisibility(flags);
    }
    private void reply(String id,Object value,String error){
        String result=value==null?"null":value instanceof String?JSONObject.quote((String)value):value.toString();
        runOnUiThread(()->js("window.nativeReply("+JSONObject.quote(id)+","+result+","+(error==null?"null":JSONObject.quote(error))+")"));
    }
    private class Bridge {
        @JavascriptInterface public String theme(){return getSharedPreferences("settings",MODE_PRIVATE).getString("theme","system");}
        @JavascriptInterface public boolean setTheme(String name){
            return Arrays.asList("system","dark","light").contains(name)&&getSharedPreferences("settings",MODE_PRIVATE).edit().putString("theme",name).commit();
        }
        @JavascriptInterface public boolean systemDark(){return (getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;}
        @JavascriptInterface public void appearance(boolean black,boolean night){runOnUiThread(()->{classroom=black;dark=night;bars();});}
        @JavascriptInterface public void request(String id,String method,String json){
            (method.equals("dictionaryQuery")?SEARCH:IO).execute(()->{try{
                JSONObject p=new JSONObject(json);Object value=null;
                switch(method){
                    case "dictionaryQuery":{
                        String term=WordStore.clean(p.getString("term"));
                        if(term.isEmpty() || term.length()>160)throw new IllegalArgumentException("请输入 1 至 160 字的词语");
                        JSONObject card=Dictionary.local(MainActivity.this,term);
                        boolean local=card!=null;
                        if(!local){
                            android.net.ConnectivityManager network=getSystemService(android.net.ConnectivityManager.class);
                            if(network==null || network.getActiveNetwork()==null)
                                throw new IOException("离线词库未收录，联网后可再查一次");
                            try {card=Dictionary.online(term);}
                            catch(IOException|JSONException unavailable){throw new IOException("离线词库未收录，在线服务暂时不可用");}
                        }
                        if(card!=null)value=new JSONObject().put("card",card).put("local",local);
                        break;
                    }
                    case "dictionaryAdd":value=store.addFromDictionary(p.getString("term"),p.getJSONObject("card"));break;
                    case "snapshot":value=store.snapshot();break;
                    case "cetProfile":value=store.cetProfile();break;
                    case "cetAction":store.cetAction(p);break;
                    case "capture":value=store.capture(p.getString("term"));LookupJob.local(MainActivity.this);break;
                    case "edit":store.edit(p);break;
                    case "favorite":store.favorite(p.getString("id"));break;
                    case "delete":store.delete(p.getString("id"));break;
                    case "grade":value=store.grade(p.getString("id"),p.getInt("grade"),p.getString("kind"),p.getString("event"));break;
                    case "retry":store.resetRetries();LookupJob.local(MainActivity.this);break;
                    case "example":{
                        JSONObject word=store.word(p.getString("id"));
                        if(word==null)break;
                        String en=word.optString("en");boolean force=p.optBoolean("force");
                        long last=exampleRequests.getOrDefault(en,0L);
                        if(!force&&System.currentTimeMillis()-last<3_600_000)break;
                        exampleRequests.put(en,System.currentTimeMillis());String wid=word.getString("id");
                        LookupJob.EXAMPLES.execute(()->{try{
                            Dictionary.Example e=Dictionary.example(en);store.example(wid,en,e);LookupJob.notifyChange();
                            reply(id,!e.text().isEmpty(),null);
                        }catch(Exception ex){reply(id,false,null);}});return;
                    }
                    case "voiceReady":value=voiceReady;break;
                    case "speak":{
                        String en=p.getString("en");
                        runOnUiThread(()->{
                            boolean ok=voiceReady && tts.speak(en,TextToSpeech.QUEUE_FLUSH,null,"word")==TextToSpeech.SUCCESS;
                            reply(id,ok,ok?null:"请在安卓文字转语音设置中启用英语语音包");
                        });return;
                    }
                    case "source":{
                        Uri uri=Uri.parse(p.getString("url"));
                        if(!"https".equals(uri.getScheme())||!"en.wiktionary.org".equals(uri.getHost()))throw new IllegalArgumentException("无效的词典来源");
                        runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,uri));reply(id,true,null);}
                        catch(ActivityNotFoundException ex){reply(id,null,"未找到可用浏览器");}});return;
                    }
                    case "ttsSettings":
                        runOnUiThread(()->{try{startActivity(new Intent("com.android.settings.TTS_SETTINGS"));reply(id,true,null);}
                        catch(ActivityNotFoundException ex){reply(id,null,"请在系统设置中搜索「文字转语音」");}});return;
                    case "export":case "import":
                        runOnUiThread(()->pick(id,method.equals("export")));return;
                    default:throw new IllegalArgumentException("未知操作");
                }reply(id,value,null);
            }catch(Exception ex){reply(id,null,ex.getMessage()==null?"操作失败，请重试":ex.getMessage());}});
        }
    }
    private void pick(String id,boolean export){
        Intent i=new Intent(export?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(export?"application/json":"*/*");
        if(export)i.putExtra(Intent.EXTRA_TITLE,"WordJot-"+new java.text.SimpleDateFormat("yyyyMMdd-HHmm",Locale.ROOT).format(new Date())+".json");
        fileRequest=id;
        try{startActivityForResult(i,export?1:2);}catch(ActivityNotFoundException ex){fileRequest=null;reply(id,null,"系统文件选择器不可用");}
    }
    @Override protected void onActivityResult(int code,int result,Intent intent){
        super.onActivityResult(code,result,intent);if(code!=1&&code!=2)return;
        String id=fileRequest;fileRequest=null;
        if(result!=RESULT_OK||intent==null||intent.getData()==null){if(id!=null)reply(id,null,null);return;}
        Uri uri=intent.getData();IO.execute(()->{try{
            String msg;
            if(code==1){byte[] data=store.backup().toString().getBytes(StandardCharsets.UTF_8);
                try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException("文件不可写");out.write(data);}msg="备份已保存";
            }else{
                JSONObject backup=new JSONObject(Dictionary.read(getContentResolver().openInputStream(uri),64*1024*1024));
                int n=store.restore(backup);LookupJob.local(this);LookupJob.notifyChange();msg="已导入 "+n+" 个词条，已有词条已保留";
            }
            if(id!=null)reply(id,msg,null);else runOnUiThread(()->Toast.makeText(this,msg,Toast.LENGTH_SHORT).show());
        }catch(Exception ex){if(id!=null)reply(id,null,"备份操作失败："+ex.getMessage());}});
    }
}
