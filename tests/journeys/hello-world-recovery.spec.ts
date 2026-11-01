import { test, expect } from '@playwright/test';
const topic = '/topics/running-the-first-cangjie-program';
const evaluation = { operationId:'11111111-1111-4111-8111-111111111111',type:'evaluation',kind:'batch',state:'confirmed',currentForDraft:true,score:{earned:10,possible:10},feedback:[] };
const submission = { operationId:'22222222-2222-4222-8222-222222222222',type:'submission',state:'retryable-error',currentForDraft:true,feedback:[] };
const workspace = { learnerId:'browser-recovery-fixture',problem:{title:'Hello, World!',statement:'Recovery fixture',starter:'main() {}',topicId:'running-the-first-cangjie-program',problemId:'hello-world',revision:1,languageVersion:'1.0.5',tests:[{id:'case-01',visibility:'visible',input:'',expected:'Hello, World!\n'}]},draft:{source:'main() {}',workRevision:1,attempted:true},progress:{bestScore:null,completed:false,nextTopicAvailable:false} };

// Controlled API evidence: these tests exercise the shipped browser component,
// not the compiler or PostgreSQL recovery implementation.
test('restores an unresolved submission independently of newer confirmed results and retries its identity', async ({page}) => {
  let resumed = false;
  const retries: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if(path === '/api/workspace') return route.fulfill({json:{...workspace,latestEvaluation:evaluation,latestSubmission:{...submission,state:'confirmed'},unresolvedSubmission: resumed ? undefined : submission}});
    if(path.endsWith('/retry')) { retries.push(path); resumed = true; return route.fulfill({json:{...submission,state:'pending'}}); }
    return route.fulfill({json:{...submission,state:'confirmed',score:{earned:10,possible:10}}});
  });
  await page.goto(topic);
  await expect(page.getByRole('heading',{name:'Topic submission',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Retry submission',exact:true}).click();
  await expect(page.getByRole('region',{name:'Evaluation results'})).toContainText('Result confirmed.');
  expect(retries).toEqual([`/api/operations/${submission.operationId}/retry`]);
});

test('dismissing a polling error retains the pending operation and continues polling', async ({page}) => {
  let finish = false;
  let polls = 0;
  await page.route('**/api/**',async route => {
    if(new URL(route.request().url()).pathname === '/api/workspace') return route.fulfill({json:{...workspace,latestEvaluation:{...evaluation,state:'pending'}}});
    polls++;
    return finish ? route.fulfill({json:evaluation}) : route.fulfill({status:503,json:{error:'Temporary status failure'}});
  });
  await page.goto(topic);
  await expect(page.getByRole('button',{name:'Dismiss',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await expect(page.getByRole('button',{name:'Run test',exact:true})).toBeDisabled();
  await expect(page.getByRole('region',{name:'Evaluation results'})).toBeVisible();
  const before = polls; finish = true;
  await expect(page.getByRole('region',{name:'Evaluation results'})).toContainText('Result confirmed.');
  expect(polls).toBeGreaterThan(before);
});

for (const failure of ['http-503','http-401','http-403','lost-response']) {
  test(`retains the same request identity after ${failure}, Dismiss and reload`, async ({page}) => {
    const keys: string[] = [];
    await page.route('**/api/**',async route => {
      const path = new URL(route.request().url()).pathname;
      if(path === '/api/workspace') return route.fulfill({json:workspace});
      if(path === '/api/evaluations') {
        keys.push(route.request().postDataJSON().requestKey);
        if(keys.length===1) return failure.startsWith('http-') ? route.fulfill({status:Number(failure.slice(5)),json:{error:'Unconfirmed request'}}) : route.abort('failed');
        return route.fulfill({json:evaluation});
      }
      return route.fulfill({json:evaluation});
    });
    await page.goto(topic);
    await page.getByRole('button',{name:'Run test',exact:true}).click();
    await expect(page.getByRole('button',{name:'Recover request',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    await expect(page.getByRole('button',{name:'Run test',exact:true})).toBeDisabled();
    await page.reload();
    await page.getByRole('button',{name:'Recover request',exact:true}).click();
    await expect(page.getByRole('region',{name:'Evaluation results'})).toContainText('Result confirmed.');
    expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
  });
}

test('retry transport failure preserves the original submission retry request', async ({page}) => {
  const retries: string[] = [];
  await page.route('**/api/**',async route => {
    const path = new URL(route.request().url()).pathname;
    if(path === '/api/workspace') return route.fulfill({json:{...workspace,latestEvaluation:evaluation,unresolvedSubmission:submission}});
    if(path.endsWith('/retry')) {
      retries.push(path);
      if(retries.length === 1) return route.abort('failed');
      return route.fulfill({json:{...submission,state:'pending'}});
    }
    return route.fulfill({json:{...submission,state:'confirmed'}});
  });
  await page.goto(topic);
  await page.getByRole('button',{name:'Retry submission',exact:true}).click();
  await expect(page.getByRole('button',{name:'Recover request',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await expect(page.getByRole('button',{name:'Review submission',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Recover request',exact:true}).click();
  await expect(page.getByRole('region',{name:'Evaluation results'})).toContainText('Result confirmed.');
  expect(retries).toEqual(Array(2).fill(`/api/operations/${submission.operationId}/retry`));
});

test('unrelated save rejection cannot abandon a pending operation', async ({page}) => {
  let finish = false;
  await page.route('**/api/**',async route => {
    const path = new URL(route.request().url()).pathname;
    if(path === '/api/workspace') return route.fulfill({json:{...workspace,latestEvaluation:{...evaluation,state:'pending'}}});
    if(path === '/api/drafts') return route.fulfill({status:409,json:{error:'Save temporarily rejected'}});
    return route.fulfill({json:{...evaluation,state:finish?'confirmed':'pending'}});
  });
  await page.goto(topic);
  await page.getByRole('button',{name:'Use plain text editor'}).click();
  await page.getByRole('textbox',{name:'Cangjie source'}).fill('// edited during evaluation\nmain() {}');
  await page.getByRole('button',{name:'Save code',exact:true}).click();
  await expect(page.getByRole('button',{name:'Dismiss',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await expect(page.getByRole('button',{name:'Run test',exact:true})).toBeDisabled();
  finish=true;
  await expect(page.getByRole('region',{name:'Evaluation results'})).toContainText('Result confirmed.');
});
