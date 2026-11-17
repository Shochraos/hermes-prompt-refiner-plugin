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
  execution:{model_override:null,reasoning_effort:null},
  preview_digest:'8be8824e2a8a13f5808bf27ced818e40a015fd88f52cb980fbc5626c3ec27a8b'
}
const plain = value => JSON.parse(JSON.stringify(value))
const description = {configured_route:golden.expected_route,configured_reasoning_effort:'high',execution_support:{model_override:true,reasoning_effort:true},image_eligibility:'not_confirmed',host_fallback_unresolved:true,model_timeout_seconds:90,compatibility_baseline:'081e8d9b75b2bedae297a89232b04ef9be7b26a0',limits:{max_files:8,max_images:3,max_text_file_bytes:65536,max_model_text_bytes:131072,max_image_bytes:1048576,max_image_pixels:4000000,max_rpc_bytes:6291456,max_candidate_bytes:32768,max_reply_bytes:16384,max_source_messages:40,max_turns:64,max_output_tokens:4096,max_running_jobs:2,max_retained_jobs:8,result_ttl_seconds:120}}
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r}); return {promise,resolve} }
function makeAtom(value) { const listeners = new Set(); return {get:()=>value,set:v=>{value=v;for(const fn of listeners)fn(value)},listen:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}} }
async function load({selectionOnly = true, oldSdk = false} = {}) {
  const options = [], contributions = [{area:'workspace'}], requests = [], disposers = [], removals = [], cancellations = [], navigations = [], reveals = [], composerWrites = [], workspaces = [], notices = []
  const route = {connectionId:'conn',mode:'remote',profile:'profile',targetProfile:'target'}
  const state = {focusedSessionOwner:makeAtom({connectionId:'conn',profile:'profile'}),focusedStoredSessionId:makeAtom(null),focusedSessionId:makeAtom(null)}
  let catalogData = {providers:[{slug:'openai-codex',name:'openai-codex',capabilities:{'fixture-model':{reasoning:true,can_disable_reasoning:true}}}]}, epoch = 1, draft = async () => 'stored draft', routes = async () => [route], request = async () => ({ok:true,data:description})
  const host = {state,composer:{getDraft:id=>draft(id),setDraft:(...args)=>composerWrites.push(args)},profileRoutes:()=>routes(),requestProfile:(...args)=>{requests.push(args);return request(...args)},openWorkspace:(id,options)=>{const workspace={id,...options,closed:false};workspaces.push(workspace);contributions[0]=workspace;return ()=>{workspace.closed=true;options.onClose()}},revealPane:id=>reveals.push(id),navigate:path=>navigations.push(path),notify:notice=>notices.push(notice)}
  const cache = {cancelQueries:q=>{cancellations.push(plain(q));return Promise.resolve()},removeQueries:q=>removals.push(plain(q))}
  const sdk = {atom:makeAtom,useValue:a=>a.get(),useQuery:o=>{options.push(o);return o.queryKey[1]==='model-options'?{data:catalogData}:{}},queryClient:cache,host,gatewayActivationEpoch:()=>epoch,COMPOSER_AREAS:{actions:'composer.actions'},Button:function Button(){},Textarea:function Textarea(){},Checkbox:function Checkbox(){},DropdownMenu:function DropdownMenu(){},DropdownMenuTrigger:function DropdownMenuTrigger(){},DropdownMenuContent:function DropdownMenuContent(){},DropdownMenuItem:function DropdownMenuItem(){},Dialog:function Dialog(){},DialogContent:function DialogContent(){},DialogTitle:function DialogTitle(){},ModelCatalogMenu:function ModelCatalogMenu(){},ModelMenuCloseContext:{Provider:function Provider(){}},REASONING_EFFORTS:['minimal','low','medium','high','xhigh','max','ultra'],REASONING_EFFORT_VALUES:['none','minimal','low','medium','high','xhigh','max','ultra'],catalogProviderMatches:(p,v)=>p.slug===v||p.name===v||p.aliases?.includes(v),reasoningEffortLabel:value=>value === 'none'?'Off':value ? value[0].toUpperCase()+value.slice(1) : ''}
  sdk.Codicon = function Codicon(){}
  if (!oldSdk) sdk.MODEL_CATALOG_CAPABILITIES = {selectionOnly}
  const slots = [], effectDeps = []; let hook = 0, effectHook = 0, effectsEnabled = false, pendingEffects = []
  const react = {useState:v=>{const i=hook++;if (!(i in slots)) slots[i]=v;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},useRef:v=>{const i=hook++;if (!(i in slots)) slots[i]={current:v};return slots[i]},useEffect:(fn,deps)=>{const i=effectHook++;if(!effectsEnabled)return;if(!effectDeps[i] || deps.some((v,j)=>!Object.is(v,effectDeps[i][j]))){effectDeps[i]=deps;pendingEffects.push(fn)}}}
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
  return {mod,ctx,contributions,requests,options,cache,composerWrites,removals,cancellations,navigations,reveals,workspaces,notices,host,state,route,get bitmapCalls(){return bitmapCalls},setSelectionOnly:v=>{sdk.MODEL_CATALOG_CAPABILITIES.selectionOnly=v},enableEffects:()=>{effectsEnabled=true},flushEffects:()=>{const work=pendingEffects;pendingEffects=[];work.forEach(fn=>fn())},render:()=>{hook=0;effectHook=0;const pane=contributions[0].render();return pane.type(pane.props)},setCatalog:v=>{catalogData=v},setEpoch:v=>{epoch=v},setDraft:v=>{draft=v},setRoutes:v=>{routes=v},setRequest:v=>{request=v},disposers}
}
function fixture(mod, overrides={}) {
  let current, n=0
  const calls=[], copies=[], removals=[], cancellations=[]
  const route={connectionId:'conn',profile:'profile',targetProfile:'target'}
  const deps = {captureOrigin:async()=>({route,storedId:null,runtimeId:null,draft:''}),requestProfile:async(r,m,p)=>{calls.push({route:r,method:m,params:plain(p)});if(m.endsWith('describe')) return {ok:true,data:description};if(m.endsWith('prepare'))return {ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}};if(m.endsWith('start'))return {ok:true,data:{identity:p.identity,handle:{job_id:'a'.repeat(32),result_capability:'A'.repeat(43)}}};return {ok:true,data:{released:true,abandoned:false}}},readSelectedFile:async x=>x,writeClipboard:async value=>{copies.push(value);return true},queryClient:{cancelQueries:q=>{cancellations.push(plain(q));return Promise.resolve()},removeQueries:q=>removals.push(plain(q))},newId:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,publish:s=>{current=s},...overrides}
  const controller=mod.namespace.createController(deps)
  return {controller,calls,copies,removals,cancellations,get state(){return current}}
}

test('actual module registers native action and pane; fresh capture never reads composer',async()=>{
  const f=await load(); let reads=0; f.setDraft(async()=>{reads++;return 'should not read'})
  f.mod.namespace.default.register(f.ctx)
  assert.deepEqual(f.contributions.map(c=>c.area),['workspace','composer.actions']);assert.equal(f.workspaces.length,0)
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
  assert.deepEqual(start.params.execution,golden.execution)
  assert.equal(start.params.protocol_version,2);assert.equal(f.calls[0].params.protocol_version,2)
  assert.equal(start.params.preview_digest,golden.preview_digest)
  assert.equal(JSON.stringify(f.state.job.queryKey).includes('A'.repeat(43)),false)
})

test('session execution is sent in v2 and invalidates a preview',async()=>{
  const f=fixture((await load()).mod),c=f.controller
  await c.open();c.setInput({userInput:'question'});c.setExecution({model_override:{provider:'trusted',model:'model'}})
  await c.prepare();const prepare=f.calls.at(-1)
  assert.equal(prepare.params.protocol_version,2);assert.deepEqual(prepare.params.execution,{model_override:{provider:'trusted',model:'model'},reasoning_effort:null})
  assert.deepEqual(prepare.params.expected_route,{provider:'trusted',model:'model'})
  c.setExecution({model_override:{provider:'trusted',model:'other'}});assert.equal(f.state.prepared,null)
  await c.prepare();await c.send();const start=f.calls.at(-1)
  assert.equal(start.params.protocol_version,2);assert.deepEqual(start.params.execution,{model_override:{provider:'trusted',model:'other'},reasoning_effort:null})
  assert.deepEqual(start.params.expected_route,{provider:'trusted',model:'other'})
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
    if(method.endsWith('prepare')) return {ok:true,data:{...golden,input_revision:params.input_revision,expected_route:params.expected_route,execution:params.execution,redacted:false}}
    if(method.endsWith('start')) return {ok:true,data:{identity:params.identity,handle}}
    if(method.endsWith('status')) return {ok:true,data:{identity:params.identity,state:'pending',result:null,error:null}}
    return {ok:true,data:{released:true,abandoned:false}}
  })
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick()
  await new Promise(resolve=>setImmediate(resolve))
  const render=()=>f.render()
  const collect=(node,out=[])=>{if(!node||typeof node!=='object')return out;out.push(node);const children=node.props?.children;for(const child of Array.isArray(children)?children:[children])collect(child,out);return out}
  let nodes=collect(render()), inputs=nodes.filter(n=>n.type?.name==='Textarea')
  inputs[0].props.onChange({target:{value:'question',style:{},scrollHeight:28}})
  nodes=collect(render());nodes.find(n=>n.props?.['aria-label']==='Send').props.onClick()
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
    if(m.endsWith('prepare'))return {ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}}
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
const click = (f,label) => nodes(f.render()).find(n=>n.props?.children===label || n.props?.['aria-label']===label).props.onClick()
const pick = (f,label) => { nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Add context or attachments')).props.onOpenChange(true); nodes(f.render()).find(n=>n.type?.name==='DropdownMenuItem' && n.props.children===label).props.onSelect() }
const typeMessage = (f,value) => nodes(f.render()).find(n=>n.props?.['aria-label']==='Message the refiner').props.onChange({target:{value,style:{},scrollHeight:28}})
const review = f => nodes(f.render()).find(n=>n.props?.['aria-label']==='Send').props.onClick()

test('production pane exposes one composer and review before upload',async()=>{
  const f=await load();f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  let all=nodes(f.render());const inputs=all.filter(n=>n.type?.name==='Textarea')
  assert.equal(inputs.length,1);assert.equal(inputs[0].props.placeholder,'Message the refiner…')
  assert.equal(all.some(n=>n.props?.children==='Prepare preview'),false)
  all.find(n=>n.props?.['aria-label']==='Send').props.onClick();all=nodes(f.render())
  assert.ok(all.some(n=>n.props?.children==='Prepare preview'))
  assert.equal(f.requests.some(r=>r[1].endsWith('prepare')),false)
})

test('model controller stays local and uses captured owner',async()=>{
  const f=await load();f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  const root=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && n.props.open===false && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'))
  root.props.onOpenChange(true)
  const catalog=nodes(f.render()).find(n=>n.type?.name==='ModelCatalogMenu');assert.ok(catalog)
  assert.equal(catalog.props.selectionOnly,true);assert.equal(catalog.props.profile,'target');assert.equal(catalog.props.ownerConnectionId,'conn');assert.equal(catalog.props.controller.allowSpeed,false)
  assert.equal(catalog.props.controller.current.effortPending,true)
  assert.deepEqual(plain(catalog.props.controller.presetFor()),{})
  catalog.props.controller.select('other','provider');catalog.props.controller.setOptions({effort:'low'},{model:'other',provider:'provider',isActive:true})
  const labels=nodes(f.render());assert.ok(labels.some(n=>n.props?.children==='other'));assert.equal(f.contributions[0].render().props.controller.getState().execution.reasoning_effort,null)
  assert.equal(labels.find(n=>n.type?.name==='ModelCatalogMenu').props.controller.current.effortPending,true)
  await catalog.props.request('model.options',{explicit_only:true});assert.equal(f.requests.at(-1)[1],'model.options');assert.deepEqual(plain(f.requests.at(-1)[0]),f.route)
  assert.equal(f.requests.some(r=>/config|setting|preset/.test(r[1])),false)
})

test('unsupported and older SDK model catalogs fail closed without effort controls',async()=>{
  for (const options of [{selectionOnly:false},{oldSdk:true}]) {
    const f=await load(options);f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
    let all=nodes(f.render()),root=all.find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'))
    assert.equal(all.find(n=>n.props?.['aria-label']==='Refiner model for this conversation').props.disabled,true)
    root.props.onOpenChange(true);all=nodes(f.render());assert.equal(all.some(n=>n.type?.name==='ModelCatalogMenu'),false);assert.equal(all.some(n=>n.props?.children==='Use configured refiner'),false)
    assert.equal(all.some(n=>n.props?.['aria-label']==='Reasoning effort for this conversation'),false)
    assert.equal(f.contributions[0].render().props.controller.getState().execution.reasoning_effort,null)
  }
})

test('revoked catalog capability fences stale handlers and unmounts controls',async()=>{
  const f=await load();f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  let all=nodes(f.render()),root=all.find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'));root.props.onOpenChange(true)
  all=nodes(f.render());const catalog=all.find(n=>n.type?.name==='ModelCatalogMenu'),reset=all.find(n=>n.props?.children==='Use configured refiner'),controller=f.contributions[0].render().props.controller,before=plain(controller.getState().execution),count=f.requests.length
  f.setSelectionOnly(false);root.props.onOpenChange(true);catalog.props.controller.select('other','provider');catalog.props.controller.applyPreset({effort:'low'},{model:'other',provider:'provider'});catalog.props.controller.setOptions({effort:'low'},{model:'fixture-model',provider:'openai-codex'});reset.props.onSelect()
  await assert.rejects(catalog.props.request('model.options',{}),/model catalog unavailable/)
  all=nodes(f.render());assert.equal(all.some(n=>n.type?.name==='ModelCatalogMenu'),false);assert.equal(all.some(n=>n.props?.children==='Use configured refiner'),false);assert.deepEqual(plain(controller.getState().execution),before);assert.equal(f.requests.length,count)
})

test('unsupported controls are disabled and resize works by keyboard and pointer',async()=>{
  const f=await load();f.setRequest(async()=>({ok:true,data:{...description,execution_support:{model_override:false,reasoning_effort:false}}}));f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  let all=nodes(f.render());assert.equal(all.find(n=>n.props?.['aria-label']==='Refiner model for this conversation').props.disabled,true);assert.equal(all.some(n=>n.props?.['aria-label']==='Reasoning effort for this conversation'),false)
  let grip=all.find(n=>n.props?.['aria-label']==='Resize message input');grip.props.onKeyDown({key:'ArrowUp',preventDefault(){}});grip=nodes(f.render()).find(n=>n.props?.['aria-label']==='Resize message input');assert.equal(grip.props['aria-valuenow'],48)
  grip.props.onPointerDown({button:0,pointerId:1,clientY:100,currentTarget:{setPointerCapture(){}},preventDefault(){}});grip.props.onPointerMove({pointerId:1,clientY:70});grip=nodes(f.render()).find(n=>n.props?.['aria-label']==='Resize message input');assert.equal(grip.props['aria-valuenow'],78)
})

test('native pane is docked beside chat and revealed only by the action',async()=>{
  const f=await load();f.mod.namespace.default.register(f.ctx);await tick()
  assert.equal(f.workspaces.length,0);assert.deepEqual(f.reveals,[])
  actionButton(f).props.onClick()
  assert.equal(f.workspaces.length,1);assert.deepEqual(plain(f.workspaces[0].dock),{pane:'workspace',pos:'right'});assert.equal(f.workspaces[0].minWidth,'22rem')
  await tick();await tick();typeMessage(f,'keep this');actionButton(f).props.onClick();assert.equal(f.workspaces.length,1);assert.deepEqual(f.reveals,['plugin-workspace:prompt-refiner'])
  f.workspaces[0].onClose();actionButton(f).props.onClick();assert.equal(f.workspaces.length,2);assert.equal(nodes(f.render()).find(n=>n.props?.['aria-label']==='Message the refiner').props.value,'keep this')
  f.disposers[0]();assert.equal(f.workspaces[1].closed,true);actionButton(f).props.onClick();assert.equal(f.workspaces.length,2)
})

test('production history picker selects only checked messages and settings action navigates',async()=>{
  const f=await load();f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime')
  f.setRequest(async (route,method,params)=>method==='session.transcript'?{rows:[{row_kind:'message',role:'user',text:'selected'},{row_kind:'message',role:'assistant',text:'omitted'},{row_kind:'compaction',role:'system',text:'summary'}],next_cursor:null,reset:false}:method.endsWith('describe')?{ok:true,data:description}:{ok:true,data:{...golden,input_revision:2,redacted:false}})
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  pick(f,'Chat context')
  click(f,'Refresh history');await tick();await tick()
  const choices=nodes(f.render()).filter(n=>n.type?.name==='Checkbox');assert.equal(choices.length,2);choices[0].props.onCheckedChange(true);await tick()
  click(f,'Done');typeMessage(f,'question');review(f)
  click(f,'Prepare preview');await tick();const call=f.requests.find(r=>r[1].endsWith('prepare'))
  assert.deepEqual(call[2].input.source_messages.map(m=>m.text),['selected']);assert.equal(call[2].session_id,undefined)
  const transcript=f.requests.find(r=>r[1]==='session.transcript');assert.equal(transcript[2].session_id,'stored');assert.equal(transcript[2].inline_images,false)
})

test('production file picker reads only chosen file and forwards selected bytes',async()=>{
  const f=await load(),reads=[]
  f.ctx.files={requestFolder:async()=>({ok:true,folder:{id:'grant',name:'folder'}}),list:async()=>({ok:true,entries:[{name:'notes.txt',path:'notes.txt',isDirectory:false},{name:'other.txt',path:'other.txt',isDirectory:false}]}),stat:async(folder,path)=>{reads.push(['stat',folder,path]);return {ok:true,exists:true,isDirectory:false,size:4}},readDataUrl:async(folder,path)=>{reads.push(['read',folder,path]);return {ok:true,url:'data:text/plain;base64,dGVzdA=='}}}
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  pick(f,'Files');click(f,'Choose folder');await tick();await tick();click(f,'Add notes.txt');await tick();await tick()
  assert.deepEqual(reads,[['stat','grant','notes.txt'],['read','grant','notes.txt']])
  assert.ok(nodes(f.render()).some(n=>typeof n.props?.children==='string' && n.props.children.includes('notes.txt')))
  click(f,'Done');typeMessage(f,'question');review(f);click(f,'Prepare preview');await tick()
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
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();pick(f,'Chat context');click(f,'Refresh history');await tick();await tick()
  nodes(f.render()).find(n=>n.type?.name==='Checkbox').props.onCheckedChange(true);await tick();click(f,'Load earlier');await tick();await tick()
  assert.equal(nodes(f.render()).filter(n=>n.type?.name==='Checkbox').length,0);assert.ok(nodes(f.render()).some(n=>n.props?.children==='History changed. Refresh and select messages again.'))
})

test('oversized image header is refused before browser decoding',async()=>{
  const f=await load(),bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(2001,16);bytes.writeUInt32BE(2000,20)
  f.ctx.files={requestFolder:async()=>({ok:true,folder:{id:'grant',name:'folder'}}),list:async()=>({ok:true,entries:[{name:'x.png',path:'x.png',isDirectory:false}]}),stat:async()=>({ok:true,exists:true,isDirectory:false,size:bytes.length}),readDataUrl:async()=>({ok:true,url:`data:image/png;base64,${bytes.toString('base64')}`})}
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();pick(f,'Images');click(f,'Choose folder');await tick();await tick();click(f,'Add x.png');await tick();await tick()
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
      if (method.endsWith('prepare')) return {ok:true,data:{...golden,input_revision:params.input_revision,expected_route:params.expected_route,execution:params.execution,redacted:false}}
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


test('stored draft prepopulates visible input without a hidden original draft',async()=>{
  const route={connectionId:'c',profile:'p',targetProfile:'t'}
  const f=fixture((await load()).mod,{captureOrigin:async()=>({route,storedId:'stored',draft:'captured text'})}),c=f.controller
  await c.open();assert.equal(f.state.userInput,'captured text');assert.equal(f.state.draft,'')
  c.setInput({userInput:'revised text'});await c.prepare()
  const input=f.calls.at(-1).params.input
  assert.equal(input.original_draft,'');assert.equal(input.user_input,'revised text')
})

test('refresh preserves model selection, discard resets without setting RPCs',async()=>{
  const f=fixture((await load()).mod),c=f.controller
  await c.open();assert.equal(f.state.routeInfo.configured_reasoning_effort,'high')
  c.setExecution({model_override:{provider:'p',model:'m'}})
  await c.refreshRoute();assert.deepEqual(plain(f.state.execution),{model_override:{provider:'p',model:'m'},reasoning_effort:null})
  c.discard();assert.deepEqual(plain(f.state.execution),{model_override:null,reasoning_effort:null})
  await c.open();assert.deepEqual(plain(f.state.execution),{model_override:null,reasoning_effort:null})
  assert.deepEqual(f.calls.map(call=>call.method),Array(3).fill('plugin.prompt-refiner.describe'))
})

test('unknown effort stays null and unsupported execution APIs are refused',async()=>{
  const unsupported={...description,configured_reasoning_effort:null,execution_support:{model_override:false,reasoning_effort:false}}
  const f=fixture((await load()).mod,{requestProfile:async()=>({ok:true,data:unsupported})}),c=f.controller
  await c.open();assert.equal(f.state.execution.reasoning_effort,null)
  c.setExecution({reasoning_effort:'low'});assert.equal(f.state.error,'Request fields or types are invalid.');assert.equal(f.state.execution.reasoning_effort,null)
  c.setExecution({model_override:{provider:'p',model:'m'}});assert.equal(f.state.execution.model_override,null)
  c.setExecution({reasoning_effort:'default'});assert.equal(f.state.error,'Request fields or types are invalid.')
  const g=fixture((await load()).mod,{requestProfile:async()=>({ok:true,data:{...unsupported,configured_reasoning_effort:'high'}})})
  await g.controller.open();assert.equal(g.state.execution.reasoning_effort,null)
})

test('trusted override supplies missing configured route but cannot borrow image attestation',async()=>{
  const calls=[],desc={...description,configured_route:null,image_eligibility:'operator_confirmed'}
  const f=fixture((await load()).mod,{requestProfile:async(r,m,p)=>{calls.push({m,p:plain(p)});return m.endsWith('describe')?{ok:true,data:desc}:{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}}}}),c=f.controller
  await c.open();c.setExecution({model_override:{provider:'p',model:'m'}});c.setInput({userInput:'x'});await c.prepare()
  assert.deepEqual(calls.at(-1).p.expected_route,{provider:'p',model:'m'});assert.ok(f.state.prepared)
  await c.setSelection({files:[{id:'22222222-2222-4222-8222-222222222222',kind:'image',name:'x.png',mime:'image/png',data_base64:'AA=='}]});const count=calls.length
  await c.prepare();assert.equal(calls.length,count);assert.match(f.state.error,/image compatibility/)
})

test('execution validation rejects extra fields, whitespace and changed preview echo',async()=>{
  const f=fixture((await load()).mod),c=f.controller;await c.open()
  for(const values of [{unexpected:1},{model_override:{provider:' p',model:'m'}},{reasoning_effort:'HIGH'},{model_override:{provider:'p',model:'m',extra:1}}]) {c.setExecution(values);assert.equal(f.state.error,'Request fields or types are invalid.')}
  let responseExecution={model_override:null,reasoning_effort:'low'}
  const g=fixture((await load()).mod,{requestProfile:async(r,m,p)=>m.endsWith('describe')?{ok:true,data:description}:{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:responseExecution,redacted:false}}})
  await g.controller.open();g.controller.setInput({userInput:'x'});await g.controller.prepare();assert.equal(g.state.prepared,null);assert.equal(g.state.error,'Invalid preview response.')
  responseExecution={model_override:null,reasoning_effort:'high',extra:true};await g.controller.prepare();assert.equal(g.state.prepared,null)
})

test('route refresh and execution edits fence pending preview adoption',async()=>{
  const waiting=deferred();let desc=description
  const f=fixture((await load()).mod,{requestProfile:async(r,m,p)=>m.endsWith('describe')?{ok:true,data:desc}:waiting.promise}),c=f.controller
  await c.open();c.setInput({userInput:'x'});const pending=c.prepare();c.setExecution({model_override:{provider:'p',model:'m'}})
  waiting.resolve({ok:true,data:{...golden,input_revision:1,redacted:false}});await pending;assert.equal(f.state.prepared,null)
  const waiting2=deferred();const g=fixture((await load()).mod,{requestProfile:async(r,m,p)=>m.endsWith('describe')?{ok:true,data:desc}:waiting2.promise})
  await g.controller.open();g.controller.setInput({userInput:'x'});const pending2=g.controller.prepare();desc={...description,execution_support:{model_override:false,reasoning_effort:false}};await g.controller.refreshRoute()
  waiting2.resolve({ok:true,data:{...golden,input_revision:1,redacted:false}});await pending2;assert.equal(g.state.prepared,null)
})

test('unsupported RPC is distinguished without exposing backend messages',async()=>{
  for(const [problem,expected] of [[{code:-32601,message:'secret'},'Required Hermes plugin API is unavailable.'],[{code:-32000,message:'secret'},'Route unavailable. Reopen from the intended chat.']]){
    const f=fixture((await load()).mod,{requestProfile:async()=>{throw problem}});await f.controller.open();assert.equal(f.state.error,expected);assert.equal(f.state.error.includes('secret'),false)
  }
  const f=fixture((await load()).mod,{requestProfile:async()=>({error:{code:-32601,message:'secret'}})});await f.controller.open();assert.equal(f.state.error,'Required Hermes plugin API is unavailable.')
})

test('review preserves missing API error through prepare and recovers on refresh',async()=>{
  const f=await load();let response={error:{code:-32601,message:'private'}}
  f.setRequest(async()=>response);f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  typeMessage(f,'my message');review(f);let all=nodes(f.render())
  assert.ok(all.some(n=>n.props?.children==='Model unavailable'));assert.ok(all.some(n=>n.props?.children==='Required Hermes plugin API is unavailable.'))
  click(f,'Prepare preview');await tick();all=nodes(f.render());assert.ok(all.some(n=>n.props?.children==='Required Hermes plugin API is unavailable.'));assert.equal(f.requests.filter(r=>r[1].endsWith('prepare')).length,0)
  response={ok:true,data:{...description,configured_route:null}};click(f,'Refresh route');await tick();await tick();all=nodes(f.render());assert.ok(all.some(n=>n.props?.children==='No model configured'))
  response={ok:true,data:description};click(f,'Refresh route');await tick();await tick();all=nodes(f.render());assert.ok(all.some(n=>n.props?.children==='Model: openai-codex / fixture-model'));assert.equal(all.some(n=>n.props?.children==='Required Hermes plugin API is unavailable.'),false)
})

test('review displays readable content and distinct consent without raw metadata',async()=>{
  const f=await load();f.setRequest(async(r,m,p)=>m.endsWith('describe')?{ok:true,data:description}:{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}})
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();typeMessage(f,'my message');review(f)
  let all=nodes(f.render());assert.ok(all.some(n=>n.props?.children==='my message'));assert.ok(all.some(n=>typeof n.props?.children==='string' && n.props.children.includes('Send to refiner sends it to a model provider')))
  click(f,'Prepare preview');await tick();all=nodes(f.render());assert.ok(all.some(n=>n.props?.children===golden.prepared.user_input));assert.ok(all.some(n=>n.props?.children==='Keine Builds.\n'));assert.ok(all.some(n=>n.props?.children==='Send to refiner'))
  const visible=all.map(n=>typeof n.props?.children==='string'?n.props.children:'').join(' ');assert.doesNotMatch(visible,/Captured owner|atomic owner|"user_input"|preview_digest/)
  const discard=all.find(n=>n.props?.['aria-label']==='Discard refinement');assert.equal(discard.props.variant,'ghost');assert.equal(discard.props.size,'icon-xs');assert.equal(discard.props.children.type.name,'Codicon')
})

test('unsupported workspace API reports error without opening or capturing',async()=>{
  const f=await load();delete f.host.openWorkspace;f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick()
  assert.equal(f.workspaces.length,0);assert.equal(f.requests.length,0);assert.match(f.notices[0].message,/cannot open/)
})

test('model override denial uses the safe mapped error',async()=>{
  const f=fixture((await load()).mod,{requestProfile:async(r,m)=>m.endsWith('describe')?{ok:true,data:description}:{ok:false,error:{code:'override_denied',message:'The host does not permit this model override.'}}})
  await f.controller.open();f.controller.setInput({userInput:'x'});await f.controller.prepare();assert.equal(f.state.error,'The host does not permit this model override.')
})


test('model change invalidates preview and refresh withdraws image attestation',async()=>{
  let desc={...description,image_eligibility:'operator_confirmed'}
  const f=fixture((await load()).mod,{requestProfile:async(r,m,p)=>m.endsWith('describe')?{ok:true,data:desc}:{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}}}),c=f.controller
  await c.open();c.setInput({userInput:'x'});await c.prepare();assert.ok(f.state.prepared)
  c.setExecution({model_override:{provider:'p',model:'m'}});assert.equal(f.state.prepared,null)
  c.setExecution({model_override:null});await c.prepare();assert.ok(f.state.prepared)
  desc={...desc,image_eligibility:'not_confirmed'};await c.refreshRoute();assert.equal(f.state.prepared,null)
})

test('refreshing changed saved reasoning invalidates the preview',async()=>{
  let desc=description
  const f=fixture((await load()).mod,{requestProfile:async(r,m,p)=>m.endsWith('describe')?{ok:true,data:desc}:{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}}}),c=f.controller
  await c.open();c.setInput({userInput:'x'});await c.prepare();assert.ok(f.state.prepared)
  desc={...desc,configured_reasoning_effort:'low'};await c.refreshRoute()
  assert.equal(f.state.prepared,null);assert.equal(f.state.routeInfo.configured_reasoning_effort,'low');assert.equal(f.state.execution.reasoning_effort,null)
})

test('busy request rejects execution edits before start acknowledgement',async()=>{
  const waiting=deferred(),calls=[]
  const f=fixture((await load()).mod,{requestProfile:async(r,m,p)=>{calls.push(m);if(m.endsWith('describe'))return {ok:true,data:description};if(m.endsWith('prepare'))return {ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}};if(m.endsWith('start')){await waiting.promise;return {ok:true,data:{identity:p.identity,handle:{job_id:'a'.repeat(32),result_capability:'A'.repeat(43)}}}};return {ok:true,data:{released:true,abandoned:false}}}}),c=f.controller
  await c.open();c.setInput({userInput:'x'});await c.prepare();const sending=c.send();c.setExecution({model_override:{provider:'p',model:'m'}});waiting.resolve();await sending;await tick()
  assert.ok(f.state.job);assert.equal(calls.includes('plugin.prompt-refiner.release'),false)
})


test('model control does not expose an effort menu',async()=>{
  const f=await load();f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  const roots=nodes(f.render()).filter(n=>n.type?.name==='DropdownMenu')
  const model=roots.find(n=>nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'))
  const effort=roots.find(n=>nodes(n).some(x=>x.props?.['aria-label']==='Reasoning effort for this conversation'))
  assert.ok(model);assert.equal(effort,undefined)
})


test('advertised effort support cannot enable overrides',async()=>{
  const f=fixture((await load()).mod),c=f.controller
  await c.open();c.setExecution({reasoning_effort:'low'})
  assert.equal(f.state.execution.reasoning_effort,null);assert.equal(f.state.error,'Request fields or types are invalid.')
  assert.equal(f.state.routeInfo.configured_reasoning_effort,'high')
})

test('busy model selection cannot alter execution',async()=>{
  const f=await load(),wait=deferred();f.setRequest(async(r,m,p)=>{if(m.endsWith('describe'))return {ok:true,data:description};if(m.endsWith('prepare'))return {ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}};if(m.endsWith('start'))return wait.promise;return {providers:[]}})
  f.setCatalog({providers:[{slug:'other',capabilities:{'fixture-model':{reasoning:true}}}]});f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  let all=nodes(f.render());assert.equal(all.some(n=>n.props?.['aria-label']==='Reasoning effort for this conversation'),false)
  const modelRoot=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'));modelRoot.props.onOpenChange(true)
  const staleCatalog=nodes(f.render()).find(n=>n.type?.name==='ModelCatalogMenu'),staleReset=nodes(f.render()).find(n=>n.props?.children==='Use configured refiner')
  typeMessage(f,'hello');review(f);click(f,'Prepare preview');await tick();click(f,'Send to refiner');await tick()
  all=nodes(f.render());assert.equal(all.find(n=>n.props?.['aria-label']==='Refiner model for this conversation').props.disabled,true)
  modelRoot.props.onOpenChange(true);staleCatalog.props.controller.select('other','provider');staleCatalog.props.controller.applyPreset({effort:'low'},{model:'other',provider:'provider'});staleReset.props.onSelect();await assert.rejects(staleCatalog.props.request('model.options',{}),/model catalog unavailable/)
  assert.equal(nodes(f.render()).some(n=>n.type?.name==='ModelCatalogMenu'),false);assert.equal(f.contributions[0].render().props.controller.getState().execution.model_override,null)
  wait.resolve({ok:false,error:{code:'busy',message:'The refiner has no available request slot.'}});await tick()
})

test('panel removes selected context and files before preview',async()=>{
  const f=await load();f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime')
  f.setRequest(async(r,m,p)=>m==='session.transcript'?{rows:[{row_kind:'message',role:'user',text:'remove me'}],reset:false}:m.endsWith('describe')?{ok:true,data:description}:{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}})
  f.ctx.files={requestFolder:async()=>({ok:true,folder:{id:'g',name:'folder'}}),list:async()=>({ok:true,entries:[{name:'notes.txt',path:'notes.txt',isDirectory:false}]}),stat:async()=>({ok:true,exists:true,isDirectory:false,size:4}),readDataUrl:async()=>({ok:true,url:'data:text/plain;base64,dGVzdA=='})}
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();pick(f,'Chat context');click(f,'Refresh history');await tick();await tick();nodes(f.render()).find(n=>n.type?.name==='Checkbox').props.onCheckedChange(true);await tick();click(f,'Done')
  pick(f,'Files');click(f,'Choose folder');await tick();await tick();click(f,'Add notes.txt');await tick();await tick();click(f,'Done')
  click(f,'Remove context');await tick();click(f,'Remove notes.txt');await tick();typeMessage(f,'hello');review(f);click(f,'Prepare preview');await tick()
  const input=f.requests.find(r=>r[1].endsWith('prepare'))[2].input;assert.deepEqual(plain(input.source_messages),[]);assert.deepEqual(plain(input.files),[])
})

test('panel copy sends only candidate text and reports clipboard acknowledgement',async()=>{
  const f=await load(),copies=[];f.ctx.os.writeClipboard=async text=>{copies.push(text);return true};f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');
  f.setRequest(async(r,m,p)=>m.endsWith('describe')?{ok:true,data:description}:m.endsWith('prepare')?{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}}:m.endsWith('start')?{ok:true,data:{identity:p.identity,handle:{job_id:'a'.repeat(32),result_capability:'A'.repeat(43)}}}:{ok:true,data:{released:true,abandoned:false}})
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();typeMessage(f,'hello');review(f);click(f,'Prepare preview');await tick();click(f,'Send to refiner');await tick()
  const pane=f.contributions[0].render(),controller=pane.props.controller,identity=controller.getState().job.identity
  controller.acceptStatus({ok:true,data:{identity,state:'succeeded',result:{assistant_reply:'Reply',candidate_prompt:'candidate only',reported_route:{provider:null,model:null},usage:null,cost:null},error:null}},identity)
  click(f,'Copy prompt');await tick();assert.deepEqual(copies,['candidate only']);assert.deepEqual(f.composerWrites,[]);assert.ok(nodes(f.render()).some(n=>n.props?.children==='Copied prompt. Paste it and reattach any required files yourself.'))
})


test('model selection keeps saved effort and sends no override',async()=>{
  const f=await load();f.setRequest(async(r,m,p)=>m.endsWith('describe')?{ok:true,data:description}:m.endsWith('prepare')?{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}}:{providers:[]})
  f.setCatalog({providers:[{slug:'provider',capabilities:{other:{reasoning:false}}}]});f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  typeMessage(f,'hello');review(f);click(f,'Prepare preview');await tick()
  const controller=f.contributions[0].render().props.controller;assert.ok(controller.getState().prepared);assert.equal(controller.getState().routeInfo.configured_reasoning_effort,'high')
  const root=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'));root.props.onOpenChange(true)
  const catalog=nodes(f.render()).find(n=>n.type?.name==='ModelCatalogMenu').props.controller,row={model:'other',provider:'provider',capabilities:{reasoning:false}}
  catalog.select(row.model,row.provider);assert.equal(controller.getState().prepared,null);assert.equal(controller.getState().execution.reasoning_effort,null)
  assert.equal(nodes(f.render()).some(n=>n.props?.['aria-label']==='Reasoning effort for this conversation'),false)
  assert.equal(controller.getState().routeInfo.configured_reasoning_effort,'high')
  click(f,'Prepare preview');await tick();const call=f.requests.filter(r=>r[1].endsWith('prepare')).at(-1)
  assert.equal(call[2].execution.reasoning_effort,null);assert.deepEqual(plain(call[2].execution.model_override),{model:'other',provider:'provider'})
  assert.deepEqual(f.composerWrites,[]);assert.equal(f.requests.some(r=>/setting|preset|config/.test(r[1])),false)
})

test('selection never sets effort regardless of advertised backend support',async()=>{
  for (const supported of [false,true]) {
    const f=await load();f.setRequest(async()=>({ok:true,data:{...description,execution_support:{model_override:true,reasoning_effort:supported}}}))
    f.setCatalog({providers:[{slug:'provider',capabilities:{other:{reasoning:true}}}]});f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
    const controller=f.contributions[0].render().props.controller,root=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'));root.props.onOpenChange(true)
    const catalog=nodes(f.render()).find(n=>n.type?.name==='ModelCatalogMenu').props.controller,writes=[],setExecution=controller.setExecution
    controller.setExecution=values=>{writes.push(values);return setExecution(values)};catalog.select('other','provider')
    assert.equal(Object.hasOwn(writes[0],'reasoning_effort'),false);assert.equal(controller.getState().execution.reasoning_effort,null)
    assert.equal(controller.getState().routeInfo.configured_reasoning_effort,'high')
  }
})

test('preset and options cannot mutate temporary execution',async()=>{
  for (const supported of [true,false]) {
    const f=await load();f.setRequest(async()=>({ok:true,data:{...description,configured_reasoning_effort:supported?'high':null,execution_support:{model_override:true,reasoning_effort:supported}}}));f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
    const controller=f.contributions[0].render().props.controller,root=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'));root.props.onOpenChange(true)
    const catalog=nodes(f.render()).find(n=>n.type?.name==='ModelCatalogMenu').props.controller,row={model:'other',provider:'provider'},writes=[],setExecution=controller.setExecution
    controller.setExecution=values=>{writes.push(values);return setExecution(values)};catalog.applyPreset({effort:false},row)
    catalog.setOptions({effort:'low'},row)
    assert.equal(writes.length,0);assert.equal(controller.getState().execution.model_override,null);assert.equal(controller.getState().execution.reasoning_effort,null)
  }
})

test('configured refiner clears temporary override without mutating saved effort',async()=>{
  const f=await load();f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  let root=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'));root.props.onOpenChange(true)
  nodes(f.render()).find(n=>n.type?.name==='ModelCatalogMenu').props.controller.select('other','provider');
  nodes(f.render()).find(n=>n.props?.children==='Use configured refiner').props.onSelect();
  const controller=f.contributions[0].render().props.controller;assert.deepEqual(plain(controller.getState().execution),{model_override:null,reasoning_effort:null});assert.equal(controller.getState().routeInfo.configured_reasoning_effort,'high')
  assert.equal(f.requests.some(r=>/setting|preset|config/.test(r[1])),false)
})

test('late model catalog is rejected when its discussion is discarded',async()=>{
  const f=await load(),wait=deferred();f.setRequest(async(r,m)=>m==='model.options'?wait.promise:{ok:true,data:description});f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick()
  let root=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu' && nodes(n).some(x=>x.props?.['aria-label']==='Refiner model for this conversation'));root.props.onOpenChange(true)
  const pending=nodes(f.render()).find(n=>n.type?.name==='ModelCatalogMenu').props.request('model.options',{});await tick();click(f,'Discard refinement');wait.resolve({providers:[]});await assert.rejects(pending,/discussion ended/)
})

test('image selection renders a removable thumbnail',async()=>{
  const f=await load(),bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1,16);bytes.writeUInt32BE(1,20)
  f.ctx.files={requestFolder:async()=>({ok:true,folder:{id:'g',name:'folder'}}),list:async()=>({ok:true,entries:[{name:'picture.png',path:'picture.png',isDirectory:false}]}),stat:async()=>({ok:true,exists:true,isDirectory:false,size:bytes.length}),readDataUrl:async()=>({ok:true,url:`data:image/png;base64,${bytes.toString('base64')}`})}
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();pick(f,'Images');click(f,'Choose folder');await tick();await tick();click(f,'Add picture.png');await tick();await tick();click(f,'Done')
  assert.ok(nodes(f.render()).some(n=>n.type==='img' && n.props.alt==='picture.png' && n.props.src.startsWith('data:image/png;base64,')));click(f,'Remove picture.png');await tick();assert.equal(nodes(f.render()).some(n=>n.type==='img' && n.props.alt==='picture.png'),false)
})


test('captured multiline grows and manual size resets only on completed send',async()=>{
  const f=await load();f.state.focusedStoredSessionId.set('stored');f.state.focusedSessionId.set('runtime');f.setDraft(async()=> 'one\ntwo\nthree')
  f.setRequest(async(r,m,p)=>m.endsWith('describe')?{ok:true,data:description}:m.endsWith('prepare')?{ok:true,data:{...golden,input_revision:p.input_revision,expected_route:p.expected_route,execution:p.execution,redacted:false}}:m.endsWith('start')?{ok:true,data:{identity:p.identity,handle:{job_id:'a'.repeat(32),result_capability:'A'.repeat(43)}}}:{ok:true,data:{released:true,abandoned:false}})
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();f.enableEffects()
  let all=nodes(f.render()),input=all.find(n=>n.props?.['aria-label']==='Message the refiner');input.props.ref.current={style:{},scrollHeight:80};f.flushEffects()
  all=nodes(f.render());assert.equal(all.find(n=>n.props?.['aria-label']==='Resize message input').props['aria-valuenow'],80)
  all.find(n=>n.props?.['aria-label']==='Resize message input').props.onKeyDown({key:'End',preventDefault(){}});typeMessage(f,'edited');f.flushEffects();all=nodes(f.render());assert.equal(all.find(n=>n.props?.['aria-label']==='Resize message input').props['aria-valuenow'],160)
  const controller=f.contributions[0].render().props.controller;await controller.prepare();await controller.send();const identity=controller.getState().job.identity
  controller.acceptStatus({ok:true,data:{identity,state:'succeeded',result:{assistant_reply:'done',candidate_prompt:null,reported_route:{provider:null,model:null},usage:null,cost:null},error:null}},identity)
  input.props.ref.current.scrollHeight=28;f.render();f.flushEffects();all=nodes(f.render());assert.equal(all.find(n=>n.props?.['aria-label']==='Resize message input').props['aria-valuenow'],28)
})


test('panel copy failure leaves candidate visible and does not write composer',async()=>{
  const f=await load(),copies=[];f.ctx.os.writeClipboard=async text=>{copies.push(text);return false}
  f.mod.namespace.default.register(f.ctx);await tick();actionButton(f).props.onClick();await tick();await tick();const controller=f.contributions[0].render().props.controller;controller.editCandidate('text only')
  assert.deepEqual(copies,[]);click(f,'Copy prompt');await tick();assert.deepEqual(copies,['text only']);assert.deepEqual(f.composerWrites,[]);assert.ok(nodes(f.render()).some(n=>n.props?.children==='Clipboard unavailable. Select text manually.'));assert.equal(controller.getState().candidate,'text only')
})
