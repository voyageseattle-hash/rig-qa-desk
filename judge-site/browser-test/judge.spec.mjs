import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reviewed='I reviewed the findings. Send only this structured report for advice.';
const acknowledge='Accepting a suggestion means investigating it. It does not authorize a repair.';
async function signin(page){await page.goto('/');await page.getByRole('link',{name:'Sign in with ChatGPT',exact:true}).click();await expect(page.getByRole('link',{name:'Sign out',exact:true})).toBeVisible();await expect(page.getByText('LOCAL MOCK REHEARSAL',{exact:true})).toBeVisible();}
async function inspect(page){await page.getByRole('button',{name:'Run measured checks',exact:true}).click();await expect(page.getByText('structural errors detected in supported checks')).toBeVisible();}
test('anonymous owned inspection and measured artist handoff are free; advice blocked',async({page})=>{
 await page.goto('/');await inspect(page);await expect(page.getByRole('img',{name:/highlighted vertex 0/})).toBeVisible();await expect(page.getByRole('button',{name:'Generate MOCK advice'})).toBeDisabled();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download artist investigation handoff'}).click();const markdown=await readFile(await (await download).path(),'utf8');
 expect(markdown).toContain('JOINT_INDEX_RANGE');expect(markdown).toContain('ANIMATION_OUTPUT_COUNT');expect(markdown).toContain('Human review: not recorded');expect(markdown).toContain('Repair approved: false');expect(markdown).toContain('did not run in this hosted');
});
test('local mock review is explicit, hash bound, and does not repair; valid counterpart preserves faults',async({page})=>{
 await signin(page);await inspect(page);await expect(page.getByRole('button',{name:'Generate MOCK advice'})).toBeDisabled();await page.getByRole('checkbox',{name:reviewed,exact:true}).check();await page.getByRole('button',{name:'Generate MOCK advice'}).click();await expect(page.getByText('MOCK · NO PROVIDER REQUEST',{exact:true})).toBeVisible();
 const exportButton=page.getByRole('button',{name:'Download reviewed evidence & decisions'});await expect(exportButton).toBeDisabled();
 await page.getByLabel('Decision for R0001',{exact:true}).selectOption('deferred');await page.getByLabel('Decision for R0002',{exact:true}).selectOption('accepted');await expect(exportButton).toBeDisabled();await page.getByRole('checkbox',{name:acknowledge,exact:true}).check();
 const downloading=page.waitForEvent('download');await exportButton.click();const review=JSON.parse(await readFile(await (await downloading).path(),'utf8'));
 expect(review.mode).toBe('mock');expect(review.human_review.actor).toBe('local_mock_rehearsal');expect(review.repair_approved).toBe(false);expect(review.new_provider_requests).toBe(0);expect(review.report_sha256).toBe(sha(review.inspection));expect(review.advice_sha256).toBe(sha(review.ai_suggestions));expect(review.human_review.decisions.map(v=>v.decision)).toEqual(['deferred','accepted']);
 await page.getByRole('button',{name:'Inspect prepared valid counterpart'}).click();await expect(page.getByText('2 → 0',{exact:true})).toBeVisible();await expect(page.locator('#F0001')).toBeVisible();await expect(page.getByRole('img',{name:/valid bone slot 0/})).toBeVisible();
});
test('changing example clears prior AI and human decisions, and all exports require current evidence',async({page})=>{
 await signin(page);await inspect(page);await page.getByRole('checkbox',{name:reviewed,exact:true}).check();await page.getByRole('button',{name:'Generate MOCK advice'}).click();await expect(page.getByText('MOCK · NO PROVIDER REQUEST',{exact:true})).toBeVisible();await page.getByLabel('Example',{exact:true}).selectOption('valid');
 await expect(page.getByText('MOCK · NO PROVIDER REQUEST',{exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:reviewed,exact:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:acknowledge,exact:true})).not.toBeChecked();await expect(page.getByRole('button',{name:'Download reviewed evidence & decisions'})).toBeDisabled();
 await page.getByRole('button',{name:'Run measured checks'}).click();await expect(page.getByText(/No issue detected by these checks/)).toBeVisible();
});
test('mobile interface fits viewport and simulated identity is labeled mock',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await inspect(page);await expect(page.getByText('LOCAL MOCK REHEARSAL',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await expect(page.getByRole('button',{name:'Download artist investigation handoff'})).toBeVisible();
});
