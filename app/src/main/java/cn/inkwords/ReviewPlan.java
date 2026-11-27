package cn.inkwords;

/** All times are Unix milliseconds. Level 4 denotes mastery. */
final class ReviewPlan {
    static final long MINUTE = 60_000L, DAY = 1440 * MINUTE;
    record Result(int level, int streak, int misses, long due) {}
    static Result next(int grade, int level, int right, int wrong, int streak, int misses,
                       long last, long previousDue, long now) {
        if (grade < 0 || grade > 3) throw new IllegalArgumentException("无效的学习评价");
        if (grade == 0) return new Result(Math.max(0, level-2), 0, misses+1,
                now + Math.max(2, 10 / (1 + misses)) * MINUTE);
        if (grade == 1) return new Result(Math.max(1, level-1), 0, misses+1,
                now + Math.max(20, 120 / (1 + misses)) * MINUTE);
        int newLevel = grade == 3 ? 4 : Math.min(4, Math.max(1, level+1));
        double accuracy = (right+2.0)/(right+wrong+3.0);
        double elapsed = last == 0 ? 0 : Math.max(0, now-last)/(double)DAY;
        double prior = last == 0 ? 0 : Math.max(0, previousDue-last)/(double)DAY;
        double base = grade == 3 ? 7 : new double[]{1,1,3,6,10}[newLevel];
        double days = Math.max(base, Math.min(prior, elapsed+1) * (1.6+accuracy))
                * (.65+.5*accuracy) * (grade==3?1.35:1) * (1+.10*Math.min(6,streak)) / (1+.18*Math.min(4,misses));
        return new Result(newLevel, streak+1, 0, now + (long)(Math.max(.5,Math.min(180,days))*DAY));
    }
}
