package cn.inkwords;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.*;
import java.io.*;
import java.nio.file.Files;
import java.util.Locale;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

final class SpeechCheck {
    static boolean run(Context ctx) throws Exception {
        CountDownLatch init=new CountDownLatch(1),done=new CountDownLatch(1);
        AtomicInteger status=new AtomicInteger(-1);
        TextToSpeech t=new TextToSpeech(ctx,s->{status.set(s);init.countDown();});
        File wav=new File(ctx.getCacheDir(),"inkwords-voice-check.wav");
        try{
            if(!init.await(12,TimeUnit.SECONDS)||status.get()!=TextToSpeech.SUCCESS||t.setLanguage(Locale.US)<0)return false;
            Voice voice=t.getVoice();if(voice==null||voice.isNetworkConnectionRequired())return false;
            t.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                public void onStart(String id){} public void onDone(String id){done.countDown();}
                public void onError(String id){status.set(-1);done.countDown();}
            });
            if(t.synthesizeToFile("classroom",new Bundle(),wav,"test")!=TextToSpeech.SUCCESS||!done.await(12,TimeUnit.SECONDS)||status.get()!=0)return false;
            byte[] bytes=Files.readAllBytes(wav.toPath());
            if(bytes.length<1000||bytes[0]!='R'||bytes[1]!='I'||bytes[2]!='F'||bytes[3]!='F')return false;
            for(int i=44;i<bytes.length;i++)if(bytes[i]!=0)return true;
            return false;
        }finally{t.shutdown();wav.delete();}
    }
}
