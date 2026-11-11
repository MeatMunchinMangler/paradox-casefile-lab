import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dailyIndexAt,initialCaseSelection,publicCaseLink} from '../app.js';

const cases=JSON.parse(readFileSync(new URL('../data/cases.json',import.meta.url),'utf8'));
const now=Date.UTC(2026,10,11,20,0,0);
const today=dailyIndexAt(now,cases.length);

test('first-time visitor starts with the first authored rookie puzzle',()=>{
  assert.equal(cases[0].id,'the-last-lift');
  assert.equal(cases[0].difficulty,'rookie');
  assert.deepEqual(initialCaseSelection(cases,'',{solved:{},dailyDays:[]},now),
    {index:0,mode:'archive'});
  assert.deepEqual(initialCaseSelection(cases,'?ignored=foo',{solved:{},dailyDays:[]},now),
    {index:0,mode:'archive'});
});

test('return visitor with real solved history sees the daily rotation',()=>{
  const progress={solved:{'the-last-lift':{solved:true,bestScore:100}},dailyDays:[]};
  assert.deepEqual(initialCaseSelection(cases,'',progress,now),
    {index:today,mode:'daily'});
});

test('return player with daily streak history sees daily rotation',()=>{
  assert.deepEqual(initialCaseSelection(cases,'',{solved:{},dailyDays:['2026-11-10']},now),
    {index:today,mode:'daily'});
  assert.deepEqual(initialCaseSelection(cases,'',{solved:{'fake-case':{solved:true}},dailyDays:[]},now),
    {index:0,mode:'archive'});
});

test('explicit daily link takes precedence even on the first visit',()=>{
  assert.deepEqual(initialCaseSelection(cases,'?daily=1',{solved:{},dailyDays:[]},now),
    {index:today,mode:'daily'});
});

test('any valid shared case link takes precedence for new and returning people',()=>{
  for(const progress of [{solved:{},dailyDays:[]},
    {solved:{'the-last-lift':{solved:true}},dailyDays:[]}]){
    assert.deepEqual(initialCaseSelection(cases,'?case=clocktower&daily=1',progress,now),
      {index:8,mode:'archive'});
  }
});

test('unknown case cannot silently select an unlisted case',()=>{
  assert.deepEqual(initialCaseSelection(cases,'?case=unknown',{solved:{},dailyDays:[]},now),
    {index:0,mode:'archive'});
  assert.deepEqual(initialCaseSelection(cases,'?case=unknown&daily=1',{solved:{},dailyDays:[]},now),
    {index:today,mode:'daily'});
});

test('invalid case archive is rejected before producing selection',()=>{
  assert.throws(()=>initialCaseSelection([],''),TypeError);
  assert.throws(()=>initialCaseSelection([{foo:1}],''),TypeError);
});

test('public challenge link drops inbound unrelated params and fragment',()=>{
  const url=publicCaseLink('the-last-lift',
    'https://paradox-casefile-lab-20261111.vercel.app/?case=clocktower&utm_source=private&token=secret#user_note');
  assert.equal(url,'https://paradox-casefile-lab-20261111.vercel.app/?case=the-last-lift');
  assert.ok(!url.includes('secret'));
  assert.ok(!url.includes('utm'));
});

test('public challenge link preserves pathname for alternate hosting roots',()=>{
  assert.equal(publicCaseLink('the-last-lift',
      'https://example.org/paradox/index.html?daily=1&key=secret#section'),
    'https://example.org/paradox/index.html?case=the-last-lift');
});

test('invalid case IDs and non-web URLs are never shared',()=>{
  for(const id of ['','bad?token=x','../x','A','the last lift']){
    assert.throws(()=>publicCaseLink(id,'https://example.org/'),TypeError);
  }
  assert.throws(()=>publicCaseLink('the-last-lift','javascript:alert(1)'),TypeError);
});
