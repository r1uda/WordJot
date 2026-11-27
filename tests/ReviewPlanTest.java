package cn.inkwords;
public class ReviewPlanTest {
    public static void main(String[] args){
        long now=1_000_000_000_000L;
        var miss=ReviewPlan.next(0,3,9,2,0,0,now-ReviewPlan.DAY,now,now);
        var again=ReviewPlan.next(0,1,9,3,0,1,now,miss.due(),now);
        var fuzzy=ReviewPlan.next(1,3,9,2,0,0,now-ReviewPlan.DAY,now,now);
        var know=ReviewPlan.next(2,2,9,2,2,0,now-3*ReviewPlan.DAY,now,now);
        var master=ReviewPlan.next(3,3,9,2,2,0,now-3*ReviewPlan.DAY,now,now);
        if(!(again.due()<miss.due()&&miss.due()<fuzzy.due()&&fuzzy.due()<know.due()&&know.due()<master.due()))throw new AssertionError("intervals");
        if(master.level()!=4||again.streak()!=0||again.misses()!=2)throw new AssertionError("state");
        var proficient=ReviewPlan.next(2,4,90,1,10,0,now-50*ReviewPlan.DAY,now,now);
        if(proficient.due()<=master.due()||proficient.due()>now+180*ReviewPlan.DAY)throw new AssertionError("long intervals");
        System.out.println("PASS review grade intervals, repeated errors, mastery, streaks and long-term cap");
    }
}
