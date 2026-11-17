import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { TextEncoder, TextDecoder } from 'node:util'
import { webcrypto } from 'node:crypto'

const golden = {
  input_revision:2,
  expected_route:{provider:'openai-codex',model:'fixture-model'},
  prepared:{original_draft:'Bitte erkläre ./build.sh; nicht ausführen.',source_messages:[{id:'11111111-1111-4111-8111-111111111111',role:'user',sequence:0,truncated:false,text:'Nur erklären.'}],files:[{id:'22222222-2222-4222-8222-222222222222',kind:'text',name:'notes.txt',text:'Keine Builds.\n'}],turns:[{role:'user',text:'Deutsch bitte.'},{role:'assistant',text:'Gern.'}],user_input:'Formuliere die Anfrage präzise.',candidate_prompt:null},
  preview_digest:'79889f9889d6f4310b7bf53af6ca468ab1fd6e9b2f4a870d816938fb5acb7e99'
}
const plain = value => JSON.parse(JSON.stringify(value))
const description = {configured_route:golden.expected_route,image_eligibility:'not_confirmed',host_fallback_unresolved:true,model_timeout_seconds:90,compatibility_baseline:'081e8d9b75b2bedae297a89232b04ef9be7b26a0',limits:{max_files:8,max_images:3,max_text_file_bytes:65536,max_model_text_bytes:131072,max_image_bytes:1048576,max_image_pixels:4000000,max_rpc_bytes:6291456,max_candidate_bytes:32768,max_reply_bytes:16384,max_source_messages:40,max_turns:64,max_output_tokens:4096,max_running_jobs:2,max_retained_jobs:8,result_ttl_seconds:120}}
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r}); return {promise,resolve} }
function makeAtom(value) { const listeners = new Set(); return {get:()=>value,set:v=>{value=v;for(const fn of listeners)fn(value)},listen:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}} }
async function load() {
  const options = [], contributions = [], requests = [], disposers = [], removals = [], cancellations = [], navigations = [], reveals = []
  const route = {connectionId:'conn',mode:'remote',profile:'profile',targetProfile:'target'}
  const state = {focusedSessionOwner:makeAtom({connectionId:'conn',profile:'profile'}),focusedStoredSessionId:makeAtom(null),focusedSessionId:makeAtom(null)}
  let epoch = 1, draft = async () => 'stored draft', routes = async () => [route], request = async () => ({ok:true,data:description})
  const host = {state,composer:{getDraft:id=>draft(id)},profileRoutes:()=>routes(),requestProfile:(...args)=>{requests.push(args);return request(...args)},revealPane:id=>reveals.push(id),navigate:path=>navigations.push(path),notify:()=>{}}
  const cache = {cancelQueries:q=>{cancellations.push(plain(q));return Promise.resolve()},removeQueries:q=>removals.push(plain(q))}
  const sdk = {atom:makeAtom,useValue:a=>a.get(),useQuery:o=>{options.push(o);return {}},queryClient:cache,host,gatewayActivationEpoch:()=>epoch,COMPOSER_AREAS:{actions:'composer.actions'},Button:function Button(){},Textarea:function Textarea(){},Checkbox:function Checkbox(){}}
  const slots = []; let hook = 0
  const react = {useState:v=>{const i=hook++;if (!(i in slots)) slots[i]=v;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},useEffect:()=>{}}
  const jsx = {jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})}
  let bitmapCalls=0
  const context = vm.createContext({TextEncoder,TextDecoder,crypto:webcrypto,Uint8Array,Blob,atob,btoa,console,createImageBitmap:async()=>{bitmapCalls++;return {width:1,height:1,close(){}}}})
  const namespaces = {'@hermes/plugin-sdk':sdk,'react':react,'react/jsx-runtime':jsx}
  const source = await readFile(new URL('../desktop/plugin.js',import.meta.url),'utf8')
  const mod = new vm.SourceTextModule(source,{context})
  await mod.link(async spec => {
    assert.ok(Object.hasOwn(namespaces,spec),`unexpected import ${spec}`)
    const exports = namespaces[spec]
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v)},{context})
  })
  await mod.evaluate()
  const ctx = {register:c=>contributions.push(c),onDispose:f=>disposers.push(f),os:{writeClipboard:async()=>true},files:{}}
  return {mod,ctx,contributions,requests,options,cache,removals,cancellations,navigations,reveals,state,route,get bitmapCalls(){return bitmapCalls},render:()=>{hook=0;const pane=contributions[0].render();return pane.type(pane.props)},setEpoch:v=>{epoch=v},setDraft:v=>{draft=v},setRoutes:v=>{routes=v},setRequest:v=>{request=v},disposers}
}
function fixture(mod, overrides={}) {
  let current, n=0
  const calls=[], copies=[], removals=[], cancellations=[]
  const route={connectionId:'conn',profile:'profile',targetProfile:'target'}
  const deps = {captureOrigin:async()=>({route,storedId:null,runtimeId:null,draft:''}),requestProfile:async(r,m,p)=>{calls.push({route:r,method:m,params:plain(p)});if(m.endsWith('describe')) return {ok:true,data:description};if(m.endsWith('prepare'))return {ok:true,data:{...golden,redacted:false}};if(m.endsWith('start'))return {ok:true,data:{identity:p.identity,handle:{job_id:'a'.repeat(32),result_capability:'A'.repeat(43)}}};return {ok:true,data:{released:true,abandoned:false}}},readSelectedFile:async x=>x,writeClipboard:async value=>{copies.push(value);return true},queryClient:{cancelQueries:q=>{cancellations.push(plain(q));return Promise.resolve()},removeQueries:q=>removals.push(plain(q))},newId:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,publish:s=>{current=s},...overrides}
  const controller=mod.namespace.createController(deps)
  return {controller,calls,copies,removals,cancellations,get state(){return current}}
}

test('actual module registers native action and pane; fresh capture never reads composer',async()=>{
  const f=await load(); let reads=0; f.setDraft(async()=>{reads++;return 'should not read'})
  f.mod.namespace.default.register(f.ctx)
  assert.deepEqual(f.contributions.map(c=>c.area),['panes','composer.actions'])
  await tick(); const action=actionButton(f); action.props.onClick()
  await new Promise(resolve=>setImmediate(resolve)); await new Promise(resolve=>setImmediate(resolve))
  assert.equal(reads,0); assert.equal(f.requests.length,1); assert.equal(f.requests[0][1],'plugin.prompt-refiner.describe')
  const pane=f.contributions[0].render(); pane.type(pane.props)
  assert.equal(f.options[0].enabled,false);assert.equal(f.options[0].retry,false);assert.equal(f.options[0].refetchInterval,3000)
  f.disposers[0]()
})

test('stored capture guards the full owner tuple across draft read',async()=>{
  const f=await load(), wait=deferred(); f.state.focusedStoredSessionId.set('stored'); f.state.focusedSessionId.set('runtime');f.setDraft(()=>wait.promise)
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();f.setEpoch(2);wait.resolve('draft')
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))
  assert.equal(f.requests.length,0)
})

test('prepare and send are distinct; golden prepared payload and digest are forwarded literally',async()=>{
  const f=fixture((await load()).mod), c=f.controller
  await c.open();assert.deepEqual(f.calls.map(x=>x.method),['plugin.prompt-refiner.describe'])
  c.setInput({draft:'manual'}); c.setInput({userInput:'refine'})
  assert.equal(f.calls.length,1)
  await c.prepare();assert.equal(f.calls.at(-1).method,'plugin.prompt-refiner.prepare')
  assert.equal(f.calls.filter(x=>x.method.endsWith('start')).length,0)
  await c.send();const start=f.calls.at(-1)
  assert.equal(start.method,'plugin.prompt-refiner.start')
  assert.equal(start.params.identity.input_revision,2)
  assert.deepEqual(start.params.expected_route,golden.expected_route)
  assert.deepEqual(start.params.prepared,golden.prepared)
  assert.equal(start.params.preview_digest,golden.preview_digest)
  assert.equal(JSON.stringify(f.state.job.queryKey).includes('A'.repeat(43)),false)
})

test('candidate edits survive late proposal; copy is explicit and acknowledgement checked',async()=>{
  const f=fixture((await load()).mod,{writeClipboard:async()=>false}), c=f.controller
  await c.open();c.setInput({draft:'x'});c.setInput({userInput:'y'});await c.prepare();await c.send()
  const identity=f.state.job.identity;c.editCandidate('manual edit')
  c.acceptStatus({ok:true,data:{identity,state:'succeeded',result:{assistant_reply:'Reply',candidate_prompt:'new proposal',reported_route:{provider:null,model:null},usage:null,cost:null},error:null}},identity)
  assert.equal(f.state.candidate,'manual edit');assert.equal(f.state.proposal,'new proposal')
  await c.copy();assert.match(f.state.error,/Clipboard unavailable/)
  c.applyProposal();assert.equal(f.state.candidate,'new proposal');assert.equal(f.state.prepared,null)
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.removals.length,1)
})

test('discard fences pending capture and pending prepare',async()=>{
  const wait=deferred(), f=fixture((await load()).mod,{captureOrigin:()=>wait.promise}), c=f.controller
  const opening=c.open();c.discard();wait.resolve({route:{connectionId:'c',profile:'p',targetProfile:'t'},draft:'secret'})
  await opening;assert.equal(f.state.origin,null);assert.equal(f.calls.length,0)
  const w=deferred(), g=fixture((await load()).mod,{requestProfile:async(r,m)=>m.endsWith('describe')?{ok:true,data:description}:w.promise})
  await g.controller.open();g.controller.setInput({userInput:'x'});const p=g.controller.prepare();g.controller.discard();w.resolve({ok:true,data:{...golden,redacted:false}});await p
  assert.equal(g.state.prepared,null);assert.equal(g.state.origin,null)
})

test('discard releases live job and clears the exact query without capability keys',async()=>{
  const f=fixture((await load()).mod),c=f.controller
  await c.open();c.setInput({draft:'x'});c.setInput({userInput:'y'});await c.prepare();await c.send();const key=plain(f.state.job.queryKey)
  c.discard();await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(f.cancellations,[{queryKey:key,exact:true}]);assert.deepEqual(f.removals,[{queryKey:key,exact:true}])
  assert.equal(f.calls.at(-1).method,'plugin.prompt-refiner.release');assert.equal(f.state.origin,null)
})

test('production panel creates a live status query with captured route and closure-only capability',async()=>{
  const f=await load(), handle={job_id:'a'.repeat(32),result_capability:'Z'.repeat(43)}
  f.setRequest(async (route,method,params)=>{
    if(method.endsWith('describe')) return {ok:true,data:description}
    if(method.endsWith('prepare')) return {ok:true,data:{...golden,redacted:false}}
    if(method.endsWith('start')) return {ok:true,data:{identity:params.identity,handle}}
    if(method.endsWith('status')) return {ok:true,data:{identity:params.identity,state:'pending',result:null,error:null}}
    return {ok:true,data:{released:true,abandoned:false}}
  })
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick()
  await new Promise(resolve=>setImmediate(resolve))
  const render=()=>{const root=f.contributions[0].render();return root.type(root.props)}
  const collect=(node,out=[])=>{if(!node||typeof node!=='object')return out;out.push(node);const children=node.props?.children;for(const child of Array.isArray(children)?children:[children])collect(child,out);return out}
  let nodes=collect(render()), inputs=nodes.filter(n=>n.type?.name==='Textarea')
  inputs[0].props.onChange({target:{value:'draft'}});inputs[1].props.onChange({target:{value:'question'}})
  nodes=collect(render());nodes.find(n=>n.props?.children==='Prepare preview').props.onClick();await new Promise(resolve=>setImmediate(resolve))
  nodes=collect(render());nodes.find(n=>n.props?.children==='Send to refiner').props.onClick();await new Promise(resolve=>setImmediate(resolve))
  render();const options=f.options.at(-1)
  assert.equal(options.enabled,true);assert.equal(options.refetchInterval,3000);assert.equal(options.retry,false)
  assert.equal(JSON.stringify(options.queryKey).includes(handle.result_capability),false)
  await options.queryFn();const call=f.requests.at(-1)
  assert.equal(call[1],'plugin.prompt-refiner.status');assert.deepEqual(plain(call[0]),f.route);assert.equal(call[2].handle.result_capability,handle.result_capability)
})

test('selection forwards only explicit snapshots and stale edits invalidate the preview',async()=>{
  const f=fixture((await load()).mod),c=f.controller
  await c.open();c.setInput({userInput:'question'})
  const selected={id:'11111111-1111-4111-8111-111111111111',role:'user',sequence:0,truncated:false,text:'selected'}
  await c.setSelection({messages:[selected]});await c.prepare()
  const input=f.calls.find(x=>x.method.endsWith('prepare')).params.input
  assert.deepEqual(input.source_messages,[selected]);assert.deepEqual(input.files,[])
  c.editCandidate('changed');await c.send()
  assert.equal(f.calls.some(x=>x.method.endsWith('start')),false)
})

test('discard while start is in flight releases a later acknowledged job',async()=>{
  const wait=deferred(), calls=[]
  const f=fixture((await load()).mod,{requestProfile:async(r,m,p)=>{
    calls.push(m)
    if(m.endsWith('describe'))return {ok:true,data:description}
    if(m.endsWith('prepare'))return {ok:true,data:{...golden,redacted:false}}
    if(m.endsWith('start'))return wait.promise.then(()=>({ok:true,data:{identity:p.identity,handle:{job_id:'a'.repeat(32),result_capability:'A'.repeat(43)}}}))
    return {ok:true,data:{released:false,abandoned:true}}
  }})
  const c=f.controller;await c.open();c.setInput({draft:'x'});c.setInput({userInput:'y'});await c.prepare()
  const sending=c.send();c.discard();wait.resolve();await sending;await new Promise(resolve=>setImmediate(resolve))
  assert.equal(f.state.origin,null);assert.ok(calls.includes('plugin.prompt-refiner.release'));assert.equal(f.removals.length,1)
})

test('malformed terminal status cannot publish discussion or candidate',async()=>{
  const f=fixture((await load()).mod),c=f.controller
  await c.open();c.setInput({draft:'x'});c.setInput({userInput:'y'});await c.prepare();await c.send()
  const identity=f.state.job.identity
  c.acceptStatus({ok:true,data:{identity,state:'succeeded',result:{assistant_reply:'reply',candidate_prompt:'candidate',reported_route:{provider:null,model:null},usage:null,cost:17},error:null}},identity)
  assert.equal(f.state.candidate,'');assert.deepEqual(plain(f.state.turns),[])
})

const nodes = (node,out=[]) => { if (!node || typeof node !== 'object') return out; out.push(node); const c=node.props?.children; for(const child of Array.isArray(c)?c:[c]) nodes(child,out); return out }
const tick = () => new Promise(resolve=>setImmediate(resolve))
const actionNodes = f => { const action=f.contributions[1].render(); return nodes(action.type(action.props)) }
const actionButton = f => actionNodes(f).find(n=>n.props?.children==='Refine')
const click = (f,label) => nodes(f.render()).find(n=>n.props?.children===label).props.onClick()

test('native pane is docked beside chat and revealed only by the action',async()=>{
  const f=await load();f.mod.namespace.default.register(f.ctx);await tick()
  const pane=f.contributions.find(c=>c.area==='panes')
  assert.deepEqual(plain(pane.data),{placement:'main',dock:{pane:'workspace',pos:'right',enforce:true},defaultCollapsed:true,width:'360px'})
  assert.deepEqual(f.reveals,[])
  actionButton(f).props.onClick()
  assert.deepEqual(f.reveals,['prompt-refiner:pane'])
})

test('production history picker selects only checked messages and settings action navigates',async()=>{
  const f=await load();f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime')
  f.setRequest(async (route,method,params)=>method==='session.transcript'?{rows:[{row_kind:'message',role:'user',text:'selected'},{row_kind:'message',role:'assistant',text:'omitted'},{row_kind:'compaction',role:'system',text:'summary'}],next_cursor:null,reset:false}:method.endsWith('describe')?{ok:true,data:description}:{ok:true,data:{...golden,input_revision:2,redacted:false}})
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  click(f,'Open auxiliary settings');assert.deepEqual(f.navigations,['/settings?tab=config:model&page=auxiliary'])
  click(f,'Refresh history');await tick();await tick()
  const choices=nodes(f.render()).filter(n=>n.type?.name==='Checkbox');assert.equal(choices.length,2);choices[0].props.onCheckedChange(true);await tick()
  const inputs=nodes(f.render()).filter(n=>n.type?.name==='Textarea');inputs[1].props.onChange({target:{value:'question'}})
  click(f,'Prepare preview');await tick();const call=f.requests.find(r=>r[1].endsWith('prepare'))
  assert.deepEqual(call[2].input.source_messages.map(m=>m.text),['selected']);assert.equal(call[2].session_id,undefined)
  const transcript=f.requests.find(r=>r[1]==='session.transcript');assert.equal(transcript[2].session_id,'stored');assert.equal(transcript[2].inline_images,false)
})

test('production file picker reads only chosen file and forwards selected bytes',async()=>{
  const f=await load(),reads=[]
  f.ctx.files={requestFolder:async()=>({ok:true,folder:{id:'grant',name:'folder'}}),list:async()=>({ok:true,entries:[{name:'notes.txt',path:'notes.txt',isDirectory:false},{name:'other.txt',path:'other.txt',isDirectory:false}]}),stat:async(folder,path)=>{reads.push(['stat',folder,path]);return {ok:true,exists:true,isDirectory:false,size:4}},readDataUrl:async(folder,path)=>{reads.push(['read',folder,path]);return {ok:true,url:'data:text/plain;base64,dGVzdA=='}}}
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  click(f,'Choose folder');await tick();await tick();click(f,'Add notes.txt');await tick();await tick()
  assert.deepEqual(reads,[['stat','grant','notes.txt'],['read','grant','notes.txt']])
  assert.ok(nodes(f.render()).some(n=>typeof n.props?.children==='string' && n.props.children.includes('notes.txt')))
  nodes(f.render()).filter(n=>n.type?.name==='Textarea')[1].props.onChange({target:{value:'question'}});click(f,'Prepare preview');await tick()
  const files=f.requests.find(r=>r[1].endsWith('prepare'))[2].input.files
  assert.equal(files.length,1);assert.equal(files[0].name,'notes.txt');assert.equal(files[0].data_base64,'dGVzdA==')
})

test('ambiguous route never reads stored draft',async()=>{
  const f=await load();let reads=0;f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');f.setDraft(async()=>{reads++;return 'secret'});f.setRoutes(async()=>[f.route,{...f.route}])
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();assert.equal(reads,0);assert.equal(f.requests.length,0)
})

test('selection and returned preview are isolated from caller mutation',async()=>{
  const f=fixture((await load()).mod),c=f.controller;await c.open();c.setInput({userInput:'x'})
  const selected={id:'11111111-1111-4111-8111-111111111111',role:'user',sequence:0,truncated:false,text:'original'}
  await c.setSelection({messages:[selected]});selected.text='changed';assert.equal(f.state.selection[0].text,'original');assert.ok(Object.isFrozen(f.state.selection[0]))
})

test('status rejects malformed envelopes and terminal invariants',async()=>{
  const f=fixture((await load()).mod),c=f.controller;await c.open();c.setInput({draft:'x'});c.setInput({userInput:'y'});await c.prepare();await c.send()
  const identity=f.state.job.identity, good={assistant_reply:'reply',candidate_prompt:'candidate',reported_route:{provider:null,model:null},usage:null,cost:null}
  const bad=[
    {ok:true,data:{identity,state:'pending',result:good,error:null}},
    {ok:true,data:{identity,state:'failed',result:good,error:{code:'model_failed',message:'The model request failed.'}}},
    {ok:true,data:{identity,state:'succeeded',result:good,error:{code:'model_failed',message:'The model request failed.'}}},
    {ok:true,data:{identity,state:'succeeded',result:{...good,assistant_reply:' '},error:null}},
    {ok:true,data:{identity,state:'succeeded',result:{...good,candidate_prompt:' '},error:null}},
    {ok:true,data:{identity,state:'succeeded',result:{...good,reported_route:{provider:'a'.repeat(257),model:null}},error:null}},
    {ok:true,data:{identity,state:'succeeded',result:{...good,usage:{input_tokens:1,output_tokens:0,total_tokens:1,cache_read_tokens:0,cache_write_tokens:true}},error:null}},
    {ok:true,data:{identity,state:'succeeded',result:good,error:null},extra:'bad'}
  ]
  for(const response of bad){c.acceptStatus(response,identity);assert.equal(f.state.candidate,'');assert.equal(f.state.turns.length,0);assert.ok(f.state.job)}
  c.acceptStatus({ok:true,data:{identity,state:'succeeded',result:good,error:null}},identity);assert.equal(f.state.candidate,'candidate')
})

test('describe rejects incomplete and extended data',async()=>{
  for(const data of [{configured_route:golden.expected_route},{...description,extra:true},{...description,limits:{...description.limits,max_images:4}}]){
    const f=fixture((await load()).mod,{requestProfile:async()=>({ok:true,data})});await f.controller.open();assert.equal(f.state.routeInfo,null)
  }
})

test('history cursor reset clears selected snapshots and requires refresh',async()=>{
  const f=await load();f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime')
  f.setRequest(async (r,m,p)=>m==='session.transcript'?(p.cursor?{rows:[],next_cursor:null,reset:true}:{rows:[{row_kind:'message',role:'user',text:'prior'}],next_cursor:'cursor',reset:true}):{ok:true,data:description})
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();click(f,'Refresh history');await tick();await tick()
  nodes(f.render()).find(n=>n.type?.name==='Checkbox').props.onCheckedChange(true);await tick();click(f,'Load earlier');await tick();await tick()
  assert.equal(nodes(f.render()).filter(n=>n.type?.name==='Checkbox').length,0);assert.ok(nodes(f.render()).some(n=>n.props?.children==='History changed. Refresh and select messages again.'))
})

test('oversized image header is refused before browser decoding',async()=>{
  const f=await load(),bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(2001,16);bytes.writeUInt32BE(2000,20)
  f.ctx.files={requestFolder:async()=>({ok:true,folder:{id:'grant',name:'folder'}}),list:async()=>({ok:true,entries:[{name:'x.png',path:'x.png',isDirectory:false}]}),stat:async()=>({ok:true,exists:true,isDirectory:false,size:bytes.length}),readDataUrl:async()=>({ok:true,url:`data:image/png;base64,${bytes.toString('base64')}`})}
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();click(f,'Choose folder');await tick();await tick();click(f,'Add x.png');await tick();await tick()
  assert.ok(nodes(f.render()).some(n=>n.props?.children==='File unavailable, unsafe, too large or unsupported. Reselect files.'));assert.equal(f.bitmapCalls,0)
})


test('warmed stored capture initiates draft read synchronously before route revalidation',async()=>{
  const f=await load(), events=[], wait=deferred()
  f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime')
  f.setRoutes(()=>{events.push('routes');return Promise.resolve([f.route])})
  f.setDraft(id=>{events.push(`draft:${id}`);return wait.promise})
  f.mod.namespace.default.register(f.ctx);await tick();events.length=0
  actionButton(f).props.onClick()
  assert.deepEqual(events,['draft:stored'])
  wait.resolve('draft');await tick();await tick()
  assert.ok(events.includes('routes'));assert.equal(f.requests.length,1)
})


test('cold action refuses draft and offers retry after metadata failure',async()=>{
  const f=await load(), wait=deferred();let reads=0
  f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');f.setDraft(()=>{reads++;return Promise.resolve('secret')});f.setRoutes(()=>wait.promise)
  f.mod.namespace.default.register(f.ctx)
  assert.equal(actionButton(f).props.disabled,true);actionButton(f).props.onClick();assert.equal(reads,0)
  wait.resolve(null);await tick()
  assert.equal(actionButton(f).props.disabled,true)
  const retry=actionNodes(f).find(n=>n.props?.children==='Retry routes');assert.ok(retry)
  f.setRoutes(async()=>[f.route]);retry.props.onClick();await tick()
  assert.equal(actionButton(f).props.disabled,false);actionButton(f).props.onClick();await tick();await tick();assert.equal(reads,1)
})

test('epoch change during prewarm discards metadata and retry uses new epoch',async()=>{
  const f=await load(), wait=deferred();let reads=0
  f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');f.setDraft(()=>{reads++;return Promise.resolve('secret')});f.setRoutes(()=>wait.promise)
  f.mod.namespace.default.register(f.ctx);f.setEpoch(2);wait.resolve([f.route]);await tick()
  assert.equal(actionButton(f).props.disabled,true);assert.equal(reads,0)
  f.setRoutes(async()=>[f.route]);actionNodes(f).find(n=>n.props?.children==='Retry routes').props.onClick();await tick()
  assert.equal(actionButton(f).props.disabled,false);actionButton(f).props.onClick();await tick();await tick();assert.equal(reads,1)
})

test('stale epoch and absent owner refuse before stored draft read',async()=>{
  const f=await load();let reads=0
  f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');f.setDraft(()=>{reads++;return Promise.resolve('secret')})
  f.mod.namespace.default.register(f.ctx);await tick();const old=actionButton(f);f.setEpoch(2)
  assert.equal(actionButton(f).props.disabled,true);old.props.onClick();assert.equal(reads,0);await tick()
  f.state.focusedSessionOwner.set(null);actionButton(f).props.onClick();await tick();assert.equal(reads,0);assert.equal(f.requests.length,0)
})

test('post-read route mismatch suppresses stored draft and describe',async()=>{
  const f=await load(), wait=deferred();f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');f.setDraft(()=>wait.promise)
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick()
  f.setRoutes(async()=>[{...f.route,targetProfile:'other'}]);wait.resolve('secret');await tick();await tick()
  assert.equal(f.requests.length,0);assert.equal(nodes(f.render()).some(n=>n.props?.value==='secret'),false)
})

test('dispose suppresses pending prewarm completion',async()=>{
  const f=await load(), wait=deferred();let reads=0
  f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');f.setDraft(()=>{reads++;return Promise.resolve('secret')});f.setRoutes(()=>wait.promise)
  f.mod.namespace.default.register(f.ctx);f.disposers[0]();wait.resolve([f.route]);await tick()
  assert.equal(actionButton(f).props.disabled,true);actionButton(f).props.onClick();await tick();assert.equal(reads,0);assert.equal(f.requests.length,0)
})

for (const change of ['draft','history','files']) {
  test(`${change} edits during a request preserve the visible candidate and separate the stale proposal`,async()=>{
    const f=fixture((await load()).mod),c=f.controller
    await c.open();c.setInput({draft:'draft'});c.setInput({userInput:'refine'});await c.prepare();await c.send()
    const identity=f.state.job.identity, candidate=f.state.candidate
    if (change === 'draft') c.setInput({draft:'new draft'})
    if (change === 'history') await c.setSelection({messages:[{id:'11111111-1111-4111-8111-111111111111',role:'user',sequence:0,truncated:false,text:'new history'}]})
    if (change === 'files') await c.setSelection({files:[{id:'22222222-2222-4222-8222-222222222222',kind:'text',name:'new.txt',mime:'text/plain',data_base64:'bmV3'}]})
    c.acceptStatus({ok:true,data:{identity,state:'succeeded',result:{assistant_reply:'Old reply',candidate_prompt:'Old-input proposal',reported_route:{provider:null,model:null},usage:null,cost:null},error:null}},identity)
    assert.equal(f.state.candidate,candidate);assert.equal(f.state.proposal,'Old-input proposal');assert.equal(f.state.job,null)
    c.applyProposal();assert.equal(f.state.candidate,'Old-input proposal');assert.equal(f.state.prepared,null)
  })
}

for (const [code,message] of [['job_not_found','This job is unavailable.'],['service_unloaded','The refiner service is no longer available.']]) {
  test(`${code} settles locally without discarding content or automatically restarting`,async()=>{
    const calls=[]
    const f=fixture((await load()).mod,{requestProfile:async(route,method,params)=>{
      calls.push({method,params:plain(params)})
      if (method.endsWith('describe')) return {ok:true,data:description}
      if (method.endsWith('prepare')) return {ok:true,data:{...golden,input_revision:params.input_revision,redacted:false}}
      if (method.endsWith('start')) return {ok:true,data:{identity:params.identity,handle:{job_id:'a'.repeat(32),result_capability:'A'.repeat(43)}}}
      return {ok:false,error:{code,message}}
    }}),c=f.controller
    await c.open();c.setInput({draft:'draft'});c.setInput({userInput:'refine'});await c.prepare();await c.send();c.editCandidate('Keep this candidate')
    const job=f.state.job, turns=plain(f.state.turns), input=f.state.userInput
    c.acceptStatus({ok:false,error:{code,message}},job.identity);await tick()
    assert.equal(f.state.job,null);assert.equal(f.state.prepared,null);assert.equal(f.state.message,null)
    assert.equal(f.state.candidate,'Keep this candidate');assert.equal(f.state.userInput,input);assert.deepEqual(plain(f.state.turns),turns)
    assert.match(f.state.error,/previous request may have run/)
    assert.deepEqual(f.cancellations,[{queryKey:plain(job.queryKey),exact:true}]);assert.deepEqual(f.removals,[{queryKey:plain(job.queryKey),exact:true}])
    assert.equal(calls.filter(call=>call.method.endsWith('start')).length,1)
    c.acceptStatus({ok:true,data:{identity:job.identity,state:'succeeded',result:{assistant_reply:'late',candidate_prompt:'late',reported_route:{provider:null,model:null},usage:null,cost:null},error:null}},job.identity)
    assert.equal(f.state.candidate,'Keep this candidate')
    c.setInput({userInput:'Try again explicitly'});await c.prepare();assert.ok(f.state.prepared);await c.send()
    assert.ok(f.state.job);assert.equal(calls.filter(call=>call.method.endsWith('start')).length,2)
  })
}
