import { test, expect } from '@playwright/test';
const first='/topics/getting-started-with-cangjie';
test('reads all three handouts in order and opens the existing coding activity',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Start the first lesson',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(first+'$'));
  await expect(page.getByRole('heading',{name:'Meet Cangjie',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Summary',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Multiple-choice activity coming soon'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Mark complete',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Next lesson: Installing the Cangjie Toolchain',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Installing the Cangjie Toolchain',exact:true})).toBeVisible();
  await expect(page.getByRole('article',{name:'Lesson handout'})).toContainText('cjc -v');
  await expect(page.getByRole('button',{name:'Multiple-choice activity coming soon'})).toBeDisabled();
  await page.getByRole('link',{name:'Next lesson: Running the First Cangjie Program',exact:true}).click();
  await expect(page.getByRole('article',{name:'Lesson handout'})).toContainText('println("Hello, World!")');
  await page.getByRole('link',{name:'Open Hello World activity',exact:true}).click();
  await expect(page).toHaveURL(/running-the-first-cangjie-program\/activity$/);
  await expect(page.getByRole('button',{name:'Open development workspace'}).or(page.getByRole('heading',{name:'Hello, World!',exact:true}))).toBeVisible();
  await page.getByRole('link',{name:'Back to lesson',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Running the First Cangjie Program',exact:true})).toBeVisible();
});
test('lesson navigation works on a small screen without making activity requests',async({page})=>{
  const mutations:string[]=[];
  page.on('request',request=>{if(request.method()!=='GET'&&new URL(request.url()).pathname.startsWith('/api/'))mutations.push(request.url());});
  await page.setViewportSize({width:375,height:812});await page.goto(first);
  await page.getByRole('navigation',{name:'On this page',exact:true}).getByRole('link',{name:'Summary',exact:true}).click();
  await expect(page).toHaveURL(/#summary$/);
  await page.reload();await expect(page.getByRole('heading',{name:'Summary',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Getting Started with Cangjie');
});
test('rejects unknown topic and unavailable activity routes',async({page})=>{
  expect((await page.goto('/topics/not-a-topic'))?.status()).toBe(404);
  expect((await page.goto(first+'/activity'))?.status()).toBe(404);
});
