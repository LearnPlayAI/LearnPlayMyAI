import { DemoDataService } from '../server/services/demoDataService.ts';
import { db } from '../server/db.ts';
import * as schema from '../shared/schema.ts';
import { sql } from 'drizzle-orm';

function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}
async function waitJob(id:string){
  const start=Date.now();
  while(Date.now()-start<15*60*1000){
    const j=DemoDataService.getJob(id);
    if(!j) throw new Error(`Job ${id} disappeared`);
    if(j.status==='completed'||j.status==='failed') return j;
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for ${id}`);
}

async function counts(){
  const [orgs]=await db.select({c:sql<number>`count(*)::int`}).from(schema.organizations);
  const [demoOrgs]=await db.select({c:sql<number>`count(*)::int`}).from(schema.organizations).where(sql`${schema.organizations.isDemo}=true`);
  const [users]=await db.select({c:sql<number>`count(*)::int`}).from(schema.users);
  const [demoUsers]=await db.select({c:sql<number>`count(*)::int`}).from(schema.users).where(sql`${schema.users.email} like ${'%+demo-%@learnplay.demo.local'}`);
  const [courses]=await db.select({c:sql<number>`count(*)::int`}).from(schema.courses);
  const [demoCourses]=await db.select({c:sql<number>`count(*)::int`}).from(schema.courses).where(sql`${schema.courses.title} like ${'[DEMO %'}`);
  const [enrollments]=await db.select({c:sql<number>`count(*)::int`}).from(schema.userCourseEnrollments);
  const [quizProgress]=await db.select({c:sql<number>`count(*)::int`}).from(schema.userQuizProgress);
  const [reviews]=await db.select({c:sql<number>`count(*)::int`}).from(schema.courseReviews);
  return {orgs:orgs.c,demoOrgs:demoOrgs.c,users:users.c,demoUsers:demoUsers.c,courses:courses.c,demoCourses:demoCourses.c,enrollments:enrollments.c,quizProgress:quizProgress.c,reviews:reviews.c};
}

async function main(){
  process.env.DEMO_DATA_ENABLED='true';
  process.env.LEARNPLAY_SYSTEM_TYPE='acc';
  process.env.SYSTEM_TYPE='acc';
  process.env.STAGE='acc';
  process.env.NODE_ENV='production';
  process.env.DEPLOYMENT_MODE='cloud';
  process.env.ONPREM_MODE='false';

  const before = await counts();
  const backupJob = await DemoDataService.enqueue('backup','e2e-runner',{});
  const backupDone = await waitJob(backupJob.id);

  const genPayload={
    orgCount:3,
    usersPerOrg:{custSuper:0,orgAdmin:2,trainerTeamLead:3,learner:10},
    departmentCount:4,
    unitCountPerOrg:5,
    teamCountPerOrg:6,
    courseCountPerOrg:8,
    includeMarketplaceSales:true,
    includeCreditPackPurchases:true,
    autoBackupBeforeGenerate:true,
    seed:Date.now(),
  };
  const genJob = await DemoDataService.enqueue('generate','e2e-runner',genPayload as any);
  const genDone = await waitJob(genJob.id);
  const afterGen = await counts();

  let restoreDone:any=null;
  let afterRestore:any=null;
  if(backupDone.status==='completed' && backupDone.result?.backup?.id){
    const restoreJob = await DemoDataService.enqueue('restore','e2e-runner',{backupId:backupDone.result.backup.id} as any);
    restoreDone = await waitJob(restoreJob.id);
    afterRestore = await counts();
  }

  console.log(JSON.stringify({
    policy: DemoDataService.getPolicy(),
    before,
    backup:{id:backupJob.id,status:backupDone.status,error:backupDone.error,result:backupDone.result},
    generate:{id:genJob.id,status:genDone.status,error:genDone.error,result:genDone.result},
    afterGen,
    restore: restoreDone ? {status:restoreDone.status,error:restoreDone.error,result:restoreDone.result} : null,
    afterRestore,
  },null,2));
}

main().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1)});
