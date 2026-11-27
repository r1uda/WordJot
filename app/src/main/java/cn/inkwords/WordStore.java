package cn.inkwords;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;
import java.text.Normalizer;
import java.util.*;

/** One process-wide repository; serializes read-modify-write with dictionary completions. */
final class WordStore extends SQLiteOpenHelper {
    private static WordStore instance;
    static synchronized WordStore get(Context ctx) {
        if (instance == null) instance = new WordStore(ctx.getApplicationContext());
        return instance;
    }
    private WordStore(Context ctx) { super(ctx, "inkwords.db", null, 3); }
    @Override public void onConfigure(SQLiteDatabase db) { db.setForeignKeyConstraintsEnabled(true); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE words(id TEXT PRIMARY KEY,en TEXT,body TEXT NOT NULL,state TEXT NOT NULL,retry INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX lookup_queue ON words(state,retry)");
        db.execSQL("CREATE UNIQUE INDEX english ON words(en) WHERE en IS NOT NULL");
        db.execSQL("CREATE TABLE aliases(term TEXT PRIMARY KEY,id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE)");
        db.execSQL("CREATE TABLE events(id TEXT PRIMARY KEY,word TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,at INTEGER NOT NULL,grade INTEGER NOT NULL,kind TEXT NOT NULL)");
        db.execSQL("CREATE INDEX time_order ON events(at)");
        createStudySettings(db);
    }
    private void createStudySettings(SQLiteDatabase db){db.execSQL("CREATE TABLE study_settings(name TEXT PRIMARY KEY,value TEXT NOT NULL)");}
    @Override public void onUpgrade(SQLiteDatabase db,int old,int next) {
        if(old<2)createStudySettings(db);
        if(old<3){
            // Retry only unresolved words against the expanded local dictionary.
            while(true){
                String id,body;
                try(Cursor c=db.rawQuery("SELECT id,body FROM words WHERE state='pending' LIMIT 1",null)){
                    if(!c.moveToFirst())break;
                    id=c.getString(0);body=c.getString(1);
                }
                try{
                    JSONObject w=new JSONObject(body).put("state","local").put("retry",0);
                    db.execSQL("UPDATE words SET state='local',retry=0,body=? WHERE id=?",new Object[]{w.toString(),id});
                }catch(JSONException e){throw new IllegalStateException("无法读取已有词条",e);}
            }
        }
    }
    synchronized JSONObject cetProfile() throws JSONException {
        JSONObject profile=new JSONObject();
        try(Cursor c=db().rawQuery("SELECT name,value FROM study_settings",null)){
            while(c.moveToNext())profile.put(c.getString(0),c.getString(1));
        }return profile;
    }
    private void updateProfile(JSONObject changes,boolean merge) throws JSONException {
        for(Iterator<String> it=changes.keys();it.hasNext();){
            String name=it.next();
            if(!name.matches("exam|(?:floor|band|run)[46]|skip:[a-z][a-z '-]{0,65}"))throw new JSONException("无效的选词设置");
            if(changes.isNull(name)){if(!merge)db().delete("study_settings","name=?",new String[]{name});continue;}
            String value=changes.getString(name);
            if(!value.matches("-?[0-9]{1,16}"))throw new JSONException("无效的选词设置值");
            db().execSQL((merge?"INSERT OR IGNORE":"INSERT OR REPLACE")+" INTO study_settings VALUES(?,?)",new Object[]{name,value});
        }
    }
    synchronized void cetAction(JSONObject p) throws Exception {
        db().beginTransaction();
        try {
            JSONObject card=p.optJSONObject("card");
            if(card!=null){
                int exam=p.getInt("exam");if(exam!=4&&exam!=6)throw new JSONException("无效的词库");
                String id=capture(card.getString("en")).getString("id");
                JSONObject w=required(id);
                if(!"ready".equals(w.getString("state"))){
                    for(String k:new String[]{"en","zh","ipa","pos"})w.put(k,card.getString(k));
                    w.put("state","ready").put("retry",0);
                }
                w.put("cet",w.optInt("cet")|(exam==4?1:2));
                if(w.optString("category").isEmpty())w.put("category",exam==4?"四级":"六级");
                save(w);
            }
            updateProfile(p.getJSONObject("changes"),false);
            db().setTransactionSuccessful();
        }finally{db().endTransaction();}
    }
    static String clean(String s) { return Normalizer.normalize(s,Normalizer.Form.NFKC).trim().replaceAll("\\s+"," ").replace('’','\''); }
    static String key(String s) { return clean(s).toLowerCase(Locale.ROOT); }
    static boolean chinese(String s) { return s.codePoints().anyMatch(c -> Character.UnicodeScript.of(c)==Character.UnicodeScript.HAN); }
    private static String uuid(){ return UUID.randomUUID().toString(); }
    private SQLiteDatabase db(){ return getWritableDatabase(); }
    private String scalar(String sql,String... args){
        try(Cursor c=db().rawQuery(sql,args)){ return c.moveToFirst()?c.getString(0):null; }
    }
    private String existing(String term){
        return scalar("SELECT id FROM words WHERE en=? UNION ALL SELECT id FROM aliases WHERE term=? LIMIT 1",key(term),key(term));
    }
    private void alias(String term,String id) {
        db().execSQL("INSERT OR IGNORE INTO aliases VALUES(?,?)", new Object[]{key(term),id});
    }
    synchronized JSONObject word(String id) throws JSONException {
        String data=scalar("SELECT body FROM words WHERE id=?",id);
        return data==null?null:new JSONObject(data);
    }
    private void save(JSONObject w) throws JSONException {
        String en=key(w.getString("en"));
        ContentValues v=new ContentValues();
        v.put("id",w.getString("id")); v.put("en",en.isEmpty()?null:en); v.put("body",w.toString());
        v.put("state",w.getString("state"));v.put("retry",w.optLong("retry"));
        if(db().update("words",v,"id=?",new String[]{w.getString("id")})==0) db().insertOrThrow("words",null,v);
    }
    synchronized String addFromDictionary(String term, JSONObject card) throws Exception {
        JSONObject fields=new JSONObject();
        for(String k:new String[]{"en","zh","ipa","pos","alternatives","example","source"})
            if(card.has(k))fields.put(k,card.getString(k));
        String en=fields.getString("en");
        if(en.trim().isEmpty()||fields.getString("zh").trim().isEmpty())throw new IllegalArgumentException("缺少双语释义");
        db().beginTransaction();
        try {
            String id=capture(term).getString("id");
            JSONObject w=required(id);
            if(!"ready".equals(w.getString("state")))resolved(id,w.getString("state"),fields);
            String kept=existing(term);
            db().setTransactionSuccessful();
            return kept;
        } finally {db().endTransaction();}
    }
    synchronized JSONObject capture(String text) throws Exception {
        String term=clean(text);
        if(term.isEmpty() || term.length()>160 || term.getBytes("UTF-8").length>500 || !term.codePoints().anyMatch(Character::isLetter))
            throw new IllegalArgumentException("请输入 1 至 160 字的英文或中文词语");
        db().beginTransaction();
        try {
            String prior=existing(term);
            if(prior!=null) {db().setTransactionSuccessful();return new JSONObject().put("duplicate",true).put("id",prior);}
            long now=System.currentTimeMillis();
            JSONObject w=new JSONObject().put("id",uuid()).put("raw",term)
                    .put("en",chinese(term)?"":term).put("zh",chinese(term)?term:"")
                    .put("added",now).put("due",now).put("state","local");
            for(String k:new String[]{"ipa","pos","example","category","alternatives"}) w.put(k,"");
            for(String k:new String[]{"level","right","wrong","streak","misses","last","retry","attempts"}) w.put(k,0);
            w.put("favorite",false).put("mistake",false);
            save(w); alias(term,w.getString("id")); db().setTransactionSuccessful();
            return new JSONObject().put("duplicate",false).put("id",w.getString("id"));
        } finally {db().endTransaction();}
    }
    synchronized JSONArray words() throws JSONException {
        JSONArray a=new JSONArray();
        try(Cursor c=db().rawQuery("SELECT body FROM words ORDER BY rowid DESC",null)){
            while(c.moveToNext()) a.put(new JSONObject(c.getString(0)));
        }
        return a;
    }
    synchronized JSONObject next(String state,long now) throws JSONException {
        // Use row order for FIFO; capture only writes the notebook, never waits on HTTP.
        try(Cursor c=db().rawQuery("SELECT body FROM words WHERE state=? AND retry<=? ORDER BY retry,rowid LIMIT 1",new String[]{state,Long.toString(now)})){
            return c.moveToFirst()?new JSONObject(c.getString(0)):null;
        }
    }
    synchronized long pendingTime(){
        String first=scalar("SELECT min(retry) FROM words WHERE state='pending'");
        return first==null?-1:Long.parseLong(first);
    }
    synchronized void resolved(String id,String expected,JSONObject result) throws JSONException {
        JSONObject w=word(id);
        if(w==null || !w.getString("state").equals(expected)) return;
        db().beginTransaction();
        try {
            if(result==null){
                w.put("state","pending");
                if(expected.equals("pending")){
                    int count=Math.min(12,w.optInt("attempts")+1);
                    w.put("attempts",count).put("retry",System.currentTimeMillis()+Math.min(360,1L<<count)*60_000);
                }
                save(w);
            } else {
                String other=existing(result.getString("en"));
                if(other!=null && !other.equals(id)){
                    JSONObject kept=word(other);
                    aliasAfterMerge(w,kept,result);
                } else {
                    for(Iterator<String> it=result.keys();it.hasNext();){String k=it.next();w.put(k,result.get(k));}
                    w.put("state","ready").put("retry",0);
                    save(w);alias(w.getString("raw"),id);
                }
            }
            db().setTransactionSuccessful();
        } finally {db().endTransaction();}
    }
    private void aliasAfterMerge(JSONObject pending,JSONObject kept,JSONObject result) throws JSONException {
        String id=pending.getString("id"), keep=kept.getString("id");
        db().execSQL("UPDATE aliases SET id=? WHERE id=?",new Object[]{keep,id});
        if(!kept.getString("state").equals("ready")){
            for(Iterator<String> it=result.keys();it.hasNext();){String k=it.next();kept.put(k,result.get(k));}
            kept.put("state","ready");
        }
        kept.put("favorite",kept.optBoolean("favorite")||pending.optBoolean("favorite"));
        if(kept.optString("category").isEmpty()) kept.put("category",pending.optString("category"));
        kept.put("added",Math.min(kept.getLong("added"),pending.getLong("added"))); save(kept);
        delete(id);
    }
    synchronized void example(String id,String en,Dictionary.Example example) throws JSONException {
        JSONObject w=word(id);
        if(w==null || !en.equals(w.optString("en"))) return;
        if(w.optString("example").isEmpty()){
            w.put("example",example.text());
            if(w.optString("source").isEmpty()&&example.source().startsWith("https://en.wiktionary.org/wiki/"))w.put("source",example.source());
        }
        if(w.optString("pos").isEmpty()) w.put("pos",example.pos());
        if(w.optString("ipa").isEmpty()) w.put("ipa",example.ipa());
        save(w);
    }
    synchronized void resetRetries() throws JSONException {
        JSONArray a=words();
        for(int i=0;i<a.length();i++){JSONObject w=a.getJSONObject(i);if(w.optString("state").equals("pending"))save(w.put("retry",0));}
    }
    synchronized void edit(JSONObject input) throws JSONException {
        JSONObject w=required(input.getString("id"));
        String en=clean(input.getString("en")), zh=input.getString("zh").trim();
        if(en.isEmpty() || chinese(en) || !en.codePoints().anyMatch(Character::isLetter) || zh.isEmpty())
            throw new IllegalArgumentException("请填写英文词条和中文释义");
        String match=existing(en);
        if(match!=null&&!match.equals(w.getString("id"))) throw new IllegalArgumentException("单词本已有相同的英文词条");
        for(String k:new String[]{"ipa","pos","example","category","alternatives"}) w.put(k,input.optString(k).trim());
        save(w.put("en",en).put("zh",zh).put("state","ready"));
    }
    private JSONObject required(String id) throws JSONException {
        JSONObject w=word(id); if(w==null)throw new IllegalArgumentException("该词条已删除");return w;
    }
    synchronized void favorite(String id) throws JSONException {JSONObject w=required(id);save(w.put("favorite",!w.optBoolean("favorite")));}
    synchronized void delete(String id){db().delete("words","id=?",new String[]{id});}
    synchronized JSONObject grade(String id,int grade,String kind,String eventId) throws JSONException {
        JSONObject w=required(id);
        if(!w.optString("state").equals("ready")) throw new IllegalArgumentException("释义尚未就绪");
        if(scalar("SELECT id FROM events WHERE id=?",eventId)!=null) return w;
        long now=System.currentTimeMillis();int r=w.optInt("right"),e=w.optInt("wrong");
        ReviewPlan.Result plan=ReviewPlan.next(grade,w.optInt("level"),r,e,w.optInt("streak"),w.optInt("misses"),w.optLong("last"),w.optLong("due"),now);
        w.put("level",plan.level()).put("due",plan.due()).put("streak",plan.streak()).put("misses",plan.misses())
                .put("right",r+(grade>=2?1:0)).put("wrong",e+(grade<2?1:0)).put("last",now);
        if(kind.equals("test")) w.put("mistake",grade<2);
        db().beginTransaction();
        try {save(w); db().execSQL("INSERT INTO events VALUES(?,?,?,?,?)",new Object[]{eventId,id,now,grade,kind});db().setTransactionSuccessful();}
        finally {db().endTransaction();}return w;
    }
    synchronized JSONObject snapshot() throws JSONException {
        JSONArray days=new JSONArray(),recent=new JSONArray();
        try(Cursor c=db().rawQuery("SELECT date(at/1000,'unixepoch','localtime'),count(*),sum(grade>=2) FROM events GROUP BY 1 ORDER BY 1 DESC LIMIT 31",null)){
            while(c.moveToNext()) days.put(new JSONArray().put(c.getString(0)).put(c.getInt(1)).put(c.getInt(2)));
        }
        try(Cursor c=db().rawQuery("SELECT word,at,grade,kind FROM events ORDER BY at DESC,rowid DESC LIMIT 8",null)){
            while(c.moveToNext())recent.put(new JSONArray().put(c.getString(0)).put(c.getLong(1)).put(c.getInt(2)).put(c.getString(3)));
        }
        return new JSONObject().put("words",words()).put("days",days).put("recent",recent);
    }
    synchronized JSONObject backup() throws JSONException {
        JSONArray events=new JSONArray(),aliases=new JSONArray();
        try(Cursor c=db().rawQuery("SELECT * FROM events",null)){while(c.moveToNext()) events.put(new JSONArray().put(c.getString(0)).put(c.getString(1)).put(c.getLong(2)).put(c.getInt(3)).put(c.getString(4)));}
        try(Cursor c=db().rawQuery("SELECT term,id FROM aliases",null)){while(c.moveToNext())aliases.put(new JSONArray().put(c.getString(0)).put(c.getString(1)));}
        return new JSONObject().put("format","InkWords").put("version",1).put("words",words()).put("events",events).put("aliases",aliases).put("cetProfile",cetProfile());
    }
    synchronized int restore(JSONObject file) throws JSONException {
        if(!"InkWords".equals(file.optString("format"))||file.optInt("version")!=1)throw new IllegalArgumentException("不支持的备份格式或版本");
        JSONArray words=file.getJSONArray("words"), ev=file.getJSONArray("events"), al=file.getJSONArray("aliases");
        Set<String> inserted=new HashSet<>(), listed=new HashSet<>();
        db().beginTransaction();
        try {
            for(int i=0;i<words.length();i++){
                JSONObject w=words.getJSONObject(i);String id=w.getString("id"),raw=w.getString("raw");
                UUID.fromString(id);
                if(!listed.add(id)||raw.trim().isEmpty()||!Arrays.asList("ready","local","pending").contains(w.getString("state")))throw new JSONException("无效词条");
                if("ready".equals(w.getString("state"))&&(w.getString("en").trim().isEmpty()||w.getString("zh").trim().isEmpty()))throw new JSONException("词条缺少释义");
                for(String k:new String[]{"right","wrong","level","streak","misses","added","due","last","retry","attempts"}) if(w.getLong(k)<0)throw new JSONException("无效的学习记录");
                if(w.getInt("level")>4)throw new JSONException("无效的掌握程度");
                if(word(id)!=null || existing(raw)!=null || (!w.getString("en").isEmpty()&&existing(w.getString("en"))!=null))continue;
                if("pending".equals(w.getString("state")))w.put("state","local").put("retry",0);
                save(w);alias(raw,id);inserted.add(id);
            }
            for(int i=0;i<al.length();i++){JSONArray a=al.getJSONArray(i);if(inserted.contains(a.getString(1)))alias(a.getString(0),a.getString(1));}
            for(int i=0;i<ev.length();i++){JSONArray a=ev.getJSONArray(i);if(inserted.contains(a.getString(1))){
                if(a.getInt(3)<0||a.getInt(3)>3||a.getLong(2)<0)throw new JSONException("无效的复习记录");
                db().execSQL("INSERT INTO events VALUES(?,?,?,?,?)",new Object[]{a.getString(0),a.getString(1),a.getLong(2),a.getInt(3),a.getString(4)});
            }}
            if(file.has("cetProfile"))updateProfile(file.getJSONObject("cetProfile"),true);
            db().setTransactionSuccessful();return inserted.size();
        } finally {db().endTransaction();}
    }
}
