package cn.inkwords;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.text.Html;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class Dictionary {
    private static final Map<String,SQLiteDatabase> databases=new HashMap<>();
    private static synchronized SQLiteDatabase open(Context ctx,String name) throws IOException {
        if(databases.containsKey(name))return databases.get(name);
        File target=new File(ctx.getFilesDir(),name+("dictionary".equals(name)?"-v2.db":"-v1.db"));
        if(!target.isFile()){
            File tmp=new File(ctx.getFilesDir(),name+".part");
            try(InputStream in=ctx.getAssets().open(name+".db");OutputStream out=new FileOutputStream(tmp)){
                byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
            }
            if(!tmp.renameTo(target)) throw new IOException("无法准备本地词典");
        }
        SQLiteDatabase dictionary=SQLiteDatabase.openDatabase(target.getPath(),null,SQLiteDatabase.OPEN_READONLY|SQLiteDatabase.NO_LOCALIZED_COLLATORS);
        databases.put(name,dictionary);
        if ("dictionary".equals(name)) ctx.deleteFile("dictionary-v1.db");
        return dictionary;
    }
    static JSONObject local(Context ctx,String raw) throws Exception {
        SQLiteDatabase db=open(ctx,"dictionary"); boolean zh=WordStore.chinese(raw);
        String en=WordStore.key(raw); ArrayList<String> alternatives=new ArrayList<>();
        if(zh){
            try(Cursor c=open(ctx,"chinese").rawQuery("SELECT en FROM translations WHERE term=? ORDER BY priority,length(en),en LIMIT 5",new String[]{en})){
                while(c.moveToNext())alternatives.add(c.getString(0));
            }
            if(alternatives.isEmpty())try(Cursor c=db.rawQuery("SELECT en FROM reverse WHERE term=? ORDER BY rank,length(en),en LIMIT 5",new String[]{en})){
                while(c.moveToNext())alternatives.add(c.getString(0));
            }
            if(alternatives.isEmpty())return null;
            en=alternatives.remove(0);String primary=en;
            alternatives.removeIf(t->t.equalsIgnoreCase(primary));
        }
        try(Cursor c=db.rawQuery("SELECT zh,ipa,pos FROM lex WHERE en=?",new String[]{WordStore.key(en)})){
            if(!c.moveToFirst())return zh?new JSONObject().put("en",en).put("zh",raw).put("alternatives",String.join(", ",alternatives)):null;
            return new JSONObject().put("en",en).put("zh",zh?raw:c.getString(0)).put("ipa",c.getString(1))
                    .put("pos",c.getString(2)).put("alternatives",String.join(", ",alternatives));
        }
    }
    static String read(InputStream stream,int limit) throws IOException {
        if(stream==null)throw new IOException("文件无法打开");
        try(InputStream input=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buf=new byte[8192];int n;while((n=input.read(buf))!=-1){
                if(out.size()+n>limit)throw new IOException("文件超过大小限制");out.write(buf,0,n);
            }return out.toString("UTF-8");
        }
    }
    private static String get(String url) throws IOException {
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
        c.setConnectTimeout(6500);c.setReadTimeout(8500);c.setRequestProperty("User-Agent","WordJot/1.2.0");
        try {if(c.getResponseCode()!=200)throw new IOException("服务暂不可用");return read(c.getInputStream(),512*1024);}
        finally {c.disconnect();}
    }
    static JSONObject online(String raw) throws Exception {
        try{
            JSONObject entry=wiktionary(raw);
            if(entry!=null)return entry;
        }catch(IOException|JSONException ignored){ /* Translation memory can cover missing dictionary entries. */ }
        boolean zh=WordStore.chinese(raw);
        String pair=zh?"zh-CN|en":"en|zh-CN";
        JSONObject r=new JSONObject(get("https://api.mymemory.translated.net/get?q="+URLEncoder.encode(raw,"UTF-8")+"&langpair="+URLEncoder.encode(pair,"UTF-8")));
        if(r.optInt("responseStatus")!=200||r.optBoolean("quotaFinished")) return null;
        String translation=Html.fromHtml(r.getJSONObject("responseData").getString("translatedText"),Html.FROM_HTML_MODE_LEGACY).toString().trim();
        if(translation.isEmpty()||WordStore.key(raw).equals(WordStore.key(translation))||WordStore.chinese(translation)==zh)return null;
        return new JSONObject().put("en",zh?translation:raw).put("zh",zh?raw:translation);
    }
    private static JSONObject wiktionary(String raw) throws Exception {
        boolean zh=WordStore.chinese(raw);
        String url="https://freedictionaryapi.com/api/v1/entries/"+(zh?"zh":"en")+"/"
                +URLEncoder.encode(raw,"UTF-8").replace("+","%20")+"?translations="+(!zh);
        JSONObject doc=new JSONObject(get(url));
        JSONArray entries=doc.getJSONArray("entries");
        for(int i=0;i<entries.length();i++){
            JSONObject entry=entries.getJSONObject(i);JSONArray senses=entry.getJSONArray("senses");
            LinkedHashSet<String> glosses=new LinkedHashSet<>();String sample="";
            for(int j=0;j<senses.length()&&glosses.size()<6;j++){
                JSONObject sense=senses.getJSONObject(j);
                if(zh){
                    String gloss=sense.optString("definition").replaceFirst("^to ","").trim();
                    if(gloss.matches("[A-Za-z][a-zA-Z '-]{0,55}")&&gloss.split(" ").length<=7)glosses.add(gloss);
                }else{
                    JSONArray ts=sense.optJSONArray("translations");
                    for(int k=0;ts!=null&&k<ts.length();k++){
                        JSONObject t=ts.getJSONObject(k);String lang=t.getJSONObject("language").optString("code"),word=t.optString("word");
                        if((lang.equals("zh")||lang.equals("cmn"))&&WordStore.chinese(word))glosses.add(word);
                    }
                    JSONArray examples=sense.optJSONArray("examples");if(sample.isEmpty()&&examples!=null)sample=examples.optString(0,"");
                }
            }
            if(glosses.isEmpty())continue;
            String ipa="";JSONArray pr=entry.optJSONArray("pronunciations");
            if(!zh&&pr!=null)for(int j=0;j<pr.length();j++){JSONObject p=pr.getJSONObject(j);if("ipa".equalsIgnoreCase(p.optString("type"))){ipa=p.optString("text");break;}}
            ArrayList<String> values=new ArrayList<>(glosses);String en=zh?values.remove(0):raw;
            return new JSONObject().put("en",en).put("zh",zh?raw:String.join("，",values)).put("pos",entry.optString("partOfSpeech"))
                    .put("alternatives",zh?String.join(", ",values):"").put("ipa",ipa).put("example",sample)
                    .put("source",doc.getJSONObject("source").getString("url"));
        }
        return null;
    }
    record Example(String text,String pos,String ipa,String source) {}
    static Example example(String en) throws Exception {
        String path=URLEncoder.encode(en,"UTF-8").replace("+","%20");
        try{
            JSONObject doc=new JSONObject(get("https://freedictionaryapi.com/api/v1/entries/en/"+path+"?translations=false"));
            JSONArray entries=doc.getJSONArray("entries");
            for(int i=0;i<entries.length();i++){
                JSONObject entry=entries.getJSONObject(i);JSONArray senses=entry.getJSONArray("senses");
                for(int j=0;j<senses.length();j++){
                    JSONArray samples=senses.getJSONObject(j).optJSONArray("examples");
                    if(samples!=null&&!samples.optString(0,"").isEmpty())
                        return new Example(samples.getString(0),entry.optString("partOfSpeech"),"",doc.getJSONObject("source").getString("url"));
                }
            }
        }catch(IOException|JSONException ignored){ /* Try the second source. */ }
        JSONArray arr=new JSONArray(get("https://api.dictionaryapi.dev/api/v2/entries/en/"+path));
        String ipa="",pos="",sample="";
        for(int i=0;i<arr.length();i++){
            JSONObject entry=arr.getJSONObject(i);if(ipa.isEmpty())ipa=entry.optString("phonetic");
            JSONArray meanings=entry.getJSONArray("meanings");
            for(int m=0;m<meanings.length();m++){
                JSONObject meaning=meanings.getJSONObject(m);if(pos.isEmpty())pos=meaning.optString("partOfSpeech");
                JSONArray defs=meaning.getJSONArray("definitions");
                for(int j=0;j<defs.length();j++){
                    sample=defs.getJSONObject(j).optString("example");
                    if(!sample.isEmpty())return new Example(sample,pos,ipa,entry.optJSONArray("sourceUrls")==null?"":entry.getJSONArray("sourceUrls").optString(0,""));
                }
            }
        }return new Example("",pos,ipa,"");
    }
}
