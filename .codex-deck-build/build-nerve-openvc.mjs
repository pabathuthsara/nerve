import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Presentation, PresentationFile } from '@oai/artifact-tool'

const workspaceDir = '/Users/pabath/Documents/nerve'
const buildDir = path.join(workspaceDir, '.codex-deck-build')
const outputDir = path.join(workspaceDir, 'output/nerve-openvc')
const skillDir = '/Users/pabath/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations'
const finalPath = path.join(outputDir, 'nerve-openvc-pitch-final.pptx')
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href)

const W = 1280, H = 720
const C = {
  bg: '#11130F', white: '#EDEFE8', muted: '#9DA396', dim: '#6A7062',
  volt: '#C4F82A', line: '#33382D', soft: '#191C16',
}
const DISPLAY = 'Arial Narrow'
const BODY = 'Arial'
const p = Presentation.create({ slideSize: { width: W, height: H } })

function tx(slide, value, x, y, w, h, size, color=C.white, opts={}) {
  const s = slide.shapes.add({
    geometry: 'textbox',
    position: { left:x, top:y, width:w, height:h },
    fill: 'none', line: { fill:'none', width:0 },
  })
  s.text = value
  s.text.style = {
    typeface: opts.display ? DISPLAY : BODY,
    fontSize:size, color, bold:opts.bold ?? false,
    autoFit:'none', verticalAlignment:'middle',
  }
  return s
}
function line(slide,x1,y1,x2,y2,color=C.line,width=1) {
  slide.shapes.add({geometry:'line',position:{left:x1,top:y1,width:x2-x1,height:y2-y1},fill:'none',line:{fill:color,width}})
}
function base(title, number, notes='') {
  const s = p.slides.add()
  s.background.fill = C.bg
  if (number > 1) {
    tx(s,'NERVE',72,24,150,35,24,C.volt,{display:true,bold:true})
    tx(s,String(number).padStart(2,'0'),1160,30,50,24,13,C.dim,{bold:true})
    line(s,72,69,1208,69)
    tx(s,title,72,99,1130,84,48,C.white,{display:true,bold:true})
  }
  s.speakerNotes.textFrame.setText(notes)
  return s
}
async function img(s,file,x,y,w,h,alt,fit='cover') {
  const bytes = new Uint8Array(await fs.readFile(file))
  s.images.add({ blob:bytes, contentType:'image/png', alt, fit, position:{left:x,top:y,width:w,height:h} })
}
function label(s,value,x,y,w=400){tx(s,value,x,y,w,30,17,C.volt,{bold:true})}
function body(s,value,x,y,w,h=90,size=25,color=C.white){tx(s,value,x,y,w,h,size,color)}

// 1. Cover
{
  const s=base('',1,'Company and founder details from the OpenVC dashboard screenshot supplied by the user. The one-sentence description reflects docs/PRODUCT.md and the current product code.')
  await img(s,path.join(workspaceDir,'public/brand/logo.png'),72,62,115,115,'Nerve brand mark','contain')
  tx(s,'NERVE',70,202,750,105,88,C.white,{display:true,bold:true})
  tx(s,'An AI conversation gym',76,322,1000,65,44,C.volt,{display:true,bold:true})
  body(s,'Helping young adults speak with confidence in dating and job interviews.',77,406,960,106,29)
  line(s,77,590,1199,590)
  tx(s,'Pabath Wedamuhandirama',77,615,600,34,22,C.white,{bold:true})
  tx(s,'hellonerve.com',930,615,270,34,22,C.muted)
}
// 2. Problem
{
  const s=base('The problem',2,'Nerve positioning and product hypothesis from docs/NERVE-SPEC.md and app/page.tsx. This is a customer problem statement, not a quantified prevalence claim.')
  tx(s,'The conversations that matter most are the hardest to rehearse.',75,215,1110,175,57,C.white,{display:true,bold:true})
  body(s,'A first date or job interview changes with every answer. Practice alone cannot reproduce hesitation, interruption, or rejection.',79,432,1070,136,31,C.muted)
  label(s,'NERVE STARTS WITH REALISTIC VOICE PRACTICE',79,620,700)
}
// 3. Product
{
  const s=base('A conversation gym',3,'Product behavior from docs/PRODUCT.md. Screenshot: public/shots/train.webp, a product UI image in the repository. UI values shown in the screenshot are demonstration content and are not traction.')
  label(s,'VOICE REPS',78,204)
  body(s,'Speak out loud with an AI character who responds in the moment.',78,247,398,170,30)
  body(s,'The dating rep lasts three minutes. The character can lose interest, get distracted, or say no.',78,449,405,132,25,C.muted)
  await img(s,path.join(buildDir,'train.png'),542,183,664,474,'Nerve dating practice screen')
}
// 4. Interview track
{
  const s=base('Interview practice',4,'Interview features and pricing from docs/PRODUCT.md and app/interviews/page.tsx. Screenshot: public/shots/interview-home.webp, a product UI image in the repository. Screenshot fields are illustrative product content, not customer data.')
  label(s,'SECOND USE CASE',78,204)
  body(s,'Candidates practice with an interviewer who has read their CV and role.',78,245,412,172,29)
  body(s,'Rounds run 5 to 25 minutes. Technical rounds can assess answer accuracy as well as delivery.',78,449,412,132,25,C.muted)
  await img(s,path.join(buildDir,'interview-home.png'),542,183,664,474,'Nerve interview practice screen')
}
// 5. Feedback
{
  const s=base('Feedback on what users can improve',5,'Scoring behavior from docs/PRODUCT.md, sections on dating and interview tracks. Screenshot: public/shots/scorecard.webp, a product UI image in the repository. Screenshot score is illustrative UI content.')
  label(s,'AFTER EACH REP',78,205)
  body(s,'A scorecard identifies the moment the conversation changed.',78,246,405,136,31)
  body(s,'Nerve grades how the user spoke, including questions, listening, and composure. A rejection can still be a strong rep.',78,414,405,169,25,C.muted)
  await img(s,path.join(buildDir,'scorecard.png'),542,183,664,474,'Nerve session scorecard')
}
// 6. Retention loop
{
  const s=base('The practice loop',6,'Current product loop synthesized from docs/PRODUCT.md and docs/RETENTION-AUDIT.md. No outcome or retention rate is claimed.')
  const items=[
    ['01','Voice rep','A timed conversation creates a real attempt.'],
    ['02','Scorecard','The user sees one concrete behavior to improve.'],
    ['03','Next mission','The next rep targets that behavior.'],
    ['04','Real-world challenge','The user tries the skill outside the app and logs what happened.'],
  ]
  let y=215
  for(const [n,h,t] of items){
    tx(s,n,78,y,80,50,35,C.volt,{display:true,bold:true})
    tx(s,h,171,y,360,50,33,C.white,{display:true,bold:true})
    body(s,t,550,y+3,600,65,22,C.muted)
    if(n!=='04')line(s,78,y+80,1205,y+80)
    y+=112
  }
}
// 7. Model
{
  const s=base('Business model',7,'Pricing from docs/PRODUCT.md and docs/LAUNCH-GAP.md D18-D19, checked against app/pricing/page.tsx and lib/billing/plans.ts. Prices are current repository configuration as inspected 12 Sep 2026, not a claim about revenue.')
  label(s,'SUBSCRIPTION VOICE PRACTICE',78,206,550)
  tx(s,'$19',78,251,235,92,69,C.white,{display:true,bold:true})
  tx(s,'Pro / month',264,278,350,52,28,C.muted)
  body(s,'3 dating voice reps per day',78,346,480,50,23)
  line(s,78,420,1204,420)
  tx(s,'$49',78,445,235,92,69,C.white,{display:true,bold:true})
  tx(s,'Elite / month',264,472,350,52,28,C.muted)
  body(s,'6 dating voice reps per day',78,540,480,50,23)
  tx(s,'INTERVIEW PACKS',678,214,440,34,18,C.volt,{bold:true})
  tx(s,'$6  /  $20  /  $45',678,273,530,70,46,C.white,{display:true,bold:true})
  body(s,'2, 8, or 20 one-time credits',678,354,465,50,23,C.muted)
  body(s,'Every account starts with one free dating rep and a five-minute interview screener.',678,474,480,126,22,C.muted)
}
// 8. Evidence
{
  const s=base('Early evidence',8,'Internal product snapshot: docs/INTERVIEW-PLAN.md §15 and docs/LAUNCH-GAP.md D21. 89 sessions across 17 users at the 7 Sep 2026 track-filter audit; 42 visits from TikTok and Meta from 4–10 Sep with 0 new accounts. These figures are dated, include possible tests, and do not establish retention, paying conversion, or product-market fit.')
  tx(s,'89',78,224,300,118,89,C.volt,{display:true,bold:true})
  tx(s,'dating sessions',83,341,365,45,28,C.white,{display:true,bold:true})
  body(s,'Across 17 user accounts in an internal product audit.',83,408,447,115,25,C.muted)
  line(s,633,217,633,545)
  tx(s,'0 / 42',704,224,468,118,83,C.white,{display:true,bold:true})
  tx(s,'visit-to-account conversions',709,341,488,74,28,C.white,{display:true,bold:true})
  body(s,'TikTok and Meta visits, 4–10 Sep. The sign-up flow was then instrumented and changed.',709,431,484,118,25,C.muted)
  tx(s,'These are learning signals, not proof of repeat paid demand.',79,613,1110,54,26,C.volt,{bold:true})
}
// 9. Market entry
{
  const s=base('Customer focus',9,'Customer segments are Nerve’s current product positioning in docs/PRODUCT.md and docs/MARKETING-PLAN.md. This slide intentionally makes no quantified TAM claim because no defensible bottom-up market estimate was available in the supplied materials.')
  label(s,'ENTRY SEGMENT',78,215)
  tx(s,'Young adults who avoid starting conversations',78,270,504,154,44,C.white,{display:true,bold:true})
  body(s,'The dating track offers short, repeatable practice and a real-world challenge.',78,482,496,104,25,C.muted)
  line(s,635,206,635,591)
  label(s,'ADJACENT SEGMENT',698,215)
  tx(s,'Candidates preparing for early career interviews',698,270,505,154,44,C.white,{display:true,bold:true})
  body(s,'The interview track adds rounds tailored to a CV and a one-time credit purchase.',698,482,494,104,25,C.muted)
}
// 10. Distribution
{
  const s=base('Go-to-market test',10,'Proposed 60-day US launch plan and $340 budget from docs/MARKETING-PLAN.md. The /start funnel instrumentation shipped 11 Sep 2026 per docs/LAUNCH-GAP.md D21. The plan is a test, not achieved traction.')
  label(s,'US LAUNCH EXPERIMENT',78,201,500)
  tx(s,'Short-form content',78,269,480,60,39,C.white,{display:true,bold:true})
  body(s,'Show one recognizable conversation mistake and the rep that corrects it.',78,342,498,128,25,C.muted)
  line(s,635,230,635,575)
  tx(s,'Creator referrals',699,269,465,60,39,C.white,{display:true,bold:true})
  body(s,'Test small paid creators while measuring each step from visit to first rep and purchase.',699,342,482,128,25,C.muted)
  line(s,78,544,1204,544)
  body(s,'The planned 60-day budget is $340. The decision metric is paid, repeat use.',78,579,1100,68,26,C.volt)
}
// 11. Team
{
  const s=base('Founder',11,'Founder name, team size and Sri Lanka location from the supplied OpenVC dashboard screenshot. Product status from docs/PRODUCT.md. No education, work history, or unsupported personal credentials are claimed.')
  tx(s,'Pabath',78,236,690,92,78,C.white,{display:true,bold:true})
  tx(s,'Wedamuhandirama',78,318,1032,93,72,C.volt,{display:true,bold:true})
  body(s,'Solo founder based in Sri Lanka',82,450,990,53,31,C.white)
  line(s,82,533,1194,533)
  body(s,'Nerve is live with voice reps, scorecards, billing, and an interview track.',82,568,1082,71,28,C.muted)
}
// 12. Ask
{
  const s=base('The ask',12,'Raise target of $100k from the user-supplied OpenVC dashboard screenshot. Milestones are a proposed use-of-funds framework, not a representation of an approved budget or guaranteed outcome.')
  tx(s,'Raising $100k',77,208,1077,127,94,C.volt,{display:true,bold:true})
  body(s,'Capital to test whether voice practice becomes repeat paid behavior.',81,361,1050,95,31,C.white)
  line(s,81,495,1202,495)
  label(s,'MILESTONES FOR THIS ROUND',81,525,600)
  body(s,'Validate the acquisition funnel. Prove paid conversion and retention. Improve voice quality and reliability with real users.',81,567,1080,100,25,C.muted)
}

await fs.mkdir(buildDir,{recursive:true})
await fs.mkdir(outputDir,{recursive:true})
const stagingDir=path.join(buildDir,'finalizer')
await fs.mkdir(stagingDir,{recursive:true})
const candidatePath=path.join(stagingDir,'candidate.pptx')
await (await PresentationFile.exportPptx(p)).save(candidatePath)

const result=await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable:'/Users/pabath/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
  integrityValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],
  explicitTotalSlideCount:12,
  requiredNativeTableOwnerSlides:[],
  requiredNativeChartOwnerSlides:[],
  fontPolicy:{basis:'design',families:[DISPLAY,BODY]},
  verifyArtifactToolImport:true,
  receiptPath:path.join(stagingDir,'nerve-openvc-pitch-final.validation.json'),
})
console.log(JSON.stringify({finalPath,result},null,2))
