import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { runInNewContext } from 'node:vm';
import { mountAccountShell } from '../public/account-shell.js';

test('every page mounts one complete account menu and working theme picker without duplicate IDs',()=>{
  for(const file of readdirSync(new URL('../public/',import.meta.url)).filter(file=>file.endsWith('.html'))){
    const {document,window}=parseHTML(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'));
    mountAccountShell(document);mountAccountShell(document);
    const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);
    assert.equal(ids.length,new Set(ids).size,file+' duplicate IDs');
    for(const id of ['account-button','menu-profile','menu-admin','menu-shop','menu-login','logout-button','appearance-menu','language-menu','settings-button','auth-dialog','settings-dialog','sound-pack'])assert.ok(document.getElementById(id),file+': '+id);
    assert.ok(document.querySelector('.site-header #account-button'));
    assert.equal(document.querySelector('#menu-admin').hidden,true);
    assert.ok(document.querySelector('script[src="'+(file==='index.html'?'/app.js':'/account-page.js')+'"]'));
    for(const css of ['auth','account-menu','themes'])assert.ok(document.querySelector(`link[href="/${css}.css"]`),file+': '+css);
    const store=new Map();
    runInNewContext(readFileSync(new URL('../public/theme.js',import.meta.url),'utf8'),{document,Event:window.Event,localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)}});
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    assert.equal(document.querySelectorAll('#theme-options [data-theme-choice]').length,6,file);
    document.querySelector('[data-theme-choice="pulse"]').click();
    assert.equal(document.documentElement.dataset.theme,'pulse');
    assert.equal(store.get('shashki-appearance-v1'),'pulse');
  }
});

test('shared page menu handles account identity, Google return, sound preferences and keyboard dismissal',async()=>{
  const {document,window}=parseHTML(readFileSync(new URL('../public/shop.html',import.meta.url),'utf8'));
  mountAccountShell(document);
  const store=new Map(),navigations=[];let reloads=0;
  Object.assign(globalThis,{document,window,Node:window.Node,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    matchMedia:()=>({matches:false}),location:{href:'https://game.test/shop',pathname:'/shop',assign:url=>navigations.push(url),reload:()=>reloads++},
    fetch:async()=>({ok:true,json:async()=>({user:null,googleEnabled:true})})});
  const $=id=>document.getElementById(id);
  for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;}
  // LinkeDOM does not implement the browser's writable select.value property.
  Object.defineProperty($('sound-pack'),'value',{writable:true,value:'wood'});
  await import('../public/account-page.js');
  const {authReady,syncAccount}=await import('../public/auth.js');await authReady;
  assert.equal(document.title,'Магазин и коллекция — Шашки');
  assert.equal($('menu-admin').hidden,true);assert.equal($('logout-button').hidden,true);
  $('account-button').click();assert.equal($('account-menu').hidden,false);
  const escape=new window.Event('keydown',{bubbles:true});escape.key='Escape';$('account-button').dispatchEvent(escape);
  assert.equal($('account-menu').hidden,true);
  $('settings-button').click();assert.equal($('settings-dialog').open,true);
  $('sound-volume').value='62';$('sound-volume').oninput();
  assert.equal(JSON.parse(store.get('shashki-sounds-v1')).volume,62);
  $('settings-back').click();assert.equal($('settings-dialog').open,false);
  $('menu-login').click();assert.equal($('auth-dialog').open,true);
  $('google-signin').click();assert.equal(navigations.at(-1),'/api/auth/google?returnTo=%2Fshop');
  syncAccount({id:'owner',name:'<b>Player</b>',email:'test@example.invalid',isAdmin:true,avatar:'/avatar.png'});
  assert.equal($('menu-admin').hidden,false);assert.equal($('menu-login').hidden,true);
  assert.equal($('account-button-label').textContent,'<b>Player</b>');assert.equal($('account-button-label').children.length,0);
  assert.equal($('account-avatar').querySelector('img').getAttribute('src'),'/avatar.png');
  $('menu-profile').click();assert.equal(navigations.at(-1),'/profile');
  document.dispatchEvent(new window.CustomEvent('accountchange',{detail:{id:'new-user'}}));assert.equal(reloads,1);
});
