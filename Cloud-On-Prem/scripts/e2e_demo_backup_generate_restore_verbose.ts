import { DemoDataService } from '../server/services/demoDataService.ts';
import { db } from '../server/db.ts';
import { sql } from 'drizzle-orm';

type Mode='cloud'|'onprem';

function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}

async function waitForJob(jobId:string, label:string){
  const start=Date.now();
  let last='';
  while(Date.now()-start<25*60*1000){
    const j=DemoDataService.getJob(jobId);
    if(!j) throw new Error(`${label}: job missing ${jobId}`);
    const sig=`${j.status}|${j.progress}|${j.message||''}`;
    if(sig!==last){
      console.log(`[${label}] ${j.status} ${j.progress}% - ${j.message||''}`);
      last=sig;
    }
    if(j.status==='completed'||j.status==='failed') return j;
    await sleep(1500);
  }
  throw new Error(`${label}: timeout waiting for ${jobId}`);
}

async function countSnapshot(){
  const get=async(q:any)=>Number((await db.execute(q)).rows?.[0]?.c||0);
  return {
    demoOrganizations: await get(sql`select count(*)::int as c from organizations where "isDemo"=true`),
    demoUsers: await get(sql`select count(*)::int as c from users where email like '%+demo-%@learnplay.demo.local'`),
    demoCourses: await get(sql`select count(*)::int as c from courses where title like '[DEMO] %'`),
    enrollments: await get(sql`select count(*)::int as c from "userCourseEnrollments"`),
    lessonProgress: await get(sql`select count(*)::int as c from "lessonProgress"`),
    quizProgress: await get(sql`select count(*)::int as c from "userQuizProgress"`),
    purchases: await get(sql`select count(*)::int as c from "coursePurchases"`),
    creditOrders: await get(sql`select count(*)::int as c from "creditOrders"`),
    interOrgRules: await get(sql`select count(*)::int as c from "interOrgCourseAssignmentRules"`),
  };
}

function diff(after:any,before:any){
  const out:any={};
  for(const k of Object.keys(before)) out[k]=(after[k]??0)-(before[k]??0);
  return out;
}

async function run(mode:Mode){
  console.log(`\n===== MODE ${mode.toUpperCase()} ACC =====`);
  process.env.NODE_ENV='production';
  process.env.DEPLOYMENT_MODE=mode;
  process.env.ONPREM_MODE=mode==='onprem'?'true':'false';
  process.env.LEARNPLAY_SYSTEM_TYPE='acc';
  process.env.SYSTEM_TYPE='acc';
  process.env.STAGE='acc';

  await DemoDataService.setPolicyOverride('auto');
  const policy=await DemoDataService.getPolicy();
  const actorRow = await db.execute(sql`select id from users order by "createdAt" asc limit 1`);
  const actorUserId = String((actorRow.rows?.[0] as any)?.id || '').trim();
  if (!actorUserId) {
    throw new Error(`No user found to act as job initiator for mode=${mode}`);
  }
  console.log(`[policy] enabled=${policy.enabled} envAllowed=${policy.envAllowed} override=${policy.policyOverride} source=${policy.enabledSource} stage=${policy.stage}`);

  const baseline=await countSnapshot();
  console.log('[baseline]', baseline);

  const backup=await DemoDataService.enqueue('backup',actorUserId,{});
  const backupDone=await waitForJob(backup.id, `${mode}-backup`);
  if(backupDone.status!=='completed') throw new Error(`${mode} backup failed: ${backupDone.error}`);
  const backupId=backupDone?.result?.backup?.id;
  if(!backupId) throw new Error(`${mode} backup missing id`);
  console.log(`[backup] id=${backupId}`);

  const gen=await DemoDataService.enqueue('generate',actorUserId,{
    orgCount: mode==='onprem'?3:2,
    usersPerOrg:{custSuper: mode==='onprem'?1:0, orgAdmin:2, trainerTeamLead:3, learner:12},
    departmentCount:4,
    unitCountPerOrg:6,
    teamCountPerOrg:8,
    courseCountPerOrg:6,
    includeMarketplaceSales:true,
    includeCreditPackPurchases:true,
    autoBackupBeforeGenerate:true,
    seed:Date.now(),
  } as any);
  const genDone=await waitForJob(gen.id, `${mode}-generate`);
  if(genDone.status!=='completed') throw new Error(`${mode} generate failed: ${genDone.error}`);

  const afterGen=await countSnapshot();
  console.log('[after-generate]', afterGen);
  console.log('[delta-generate]', diff(afterGen, baseline));

  const restore=await DemoDataService.enqueue('restore',actorUserId,{backupId} as any);
  const restoreDone=await waitForJob(restore.id, `${mode}-restore`);
  if(restoreDone.status!=='completed') throw new Error(`${mode} restore failed: ${restoreDone.error}`);

  const afterRestore=await countSnapshot();
  console.log('[after-restore]', afterRestore);
  console.log('[delta-restore-vs-baseline]', diff(afterRestore, baseline));

  return {mode, policy, baseline, afterGen, afterRestore, deltaGenerate: diff(afterGen, baseline), deltaRestore: diff(afterRestore, baseline), genResult: genDone.result};
}

async function main(){
  const cloud=await run('cloud');
  const onprem=await run('onprem');
  console.log('\n===== SUMMARY JSON =====');
  console.log(JSON.stringify({ok:true, cloud, onprem}, null, 2));
}

main().catch((e)=>{console.error('\nE2E FAILED'); console.error(e); process.exit(1);});
