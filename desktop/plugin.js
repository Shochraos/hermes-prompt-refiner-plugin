import * as sdk from '@hermes/plugin-sdk'
import { atom, useValue, useQuery, queryClient, host, gatewayActivationEpoch, COMPOSER_AREAS, Button, Textarea, Checkbox, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Dialog, DialogContent, DialogTitle, ModelCatalogMenu, ModelMenuCloseContext } from '@hermes/plugin-sdk'
import { useEffect, useState, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const prefix = 'plugin.prompt-refiner.'
const warning = 'Hermes may use a fallback model. Images are not redacted.'
const textExtensions = new Set('txt md rst csv tsv json yaml yml toml ini xml html css scss js jsx ts tsx py sh bash nix c h cpp hpp rs go java sql log'.split(' '))
const imageExtensions = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const byteLength = value => new TextEncoder().encode(value).length
const safeText = (value, max) => typeof value === 'string' && !value.includes('\0') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value) && byteLength(value) <= max
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key))
const idValid = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
const labelValid = s => safeText(s,256) && !!s.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(s) && !['auto','default'].includes(s.trim().toLowerCase())
const labelsValid = route => closed(route,['provider','model']) && labelValid(route.provider) && labelValid(route.model)
const efforts = new Set('none minimal low medium high xhigh max ultra'.split(' '))
const executionValid = value => closed(value,['model_override','reasoning_effort']) && (value.model_override === null || (labelsValid(value.model_override) && Object.values(value.model_override).every(part=>part === part.trim()))) && value.reasoning_effort === null
const sameExecution = (a,b) => executionValid(a) && executionValid(b) && (a.model_override === null ? b.model_override === null : sameLabels(a.model_override,b.model_override)) && a.reasoning_effort === b.reasoning_effort
const nameValid = name => safeText(name,255) && !!name.trim() && name !== '.' && name !== '..' && !/[/\\\x00-\x1f\x7f-\x9f]/.test(name)
const base64Valid = (value, max, decodedMax) => typeof value === 'string' && value.length <= max && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) && value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) <= decodedMax && (value.length === 0 || btoa(atob(value)) === value)
function inputValid(input, prepared) {
  if (!closed(input,['original_draft','source_messages','files','turns','user_input','candidate_prompt']) || !safeText(input.original_draft,131072) || !safeText(input.user_input,16384) || !input.user_input.trim() || !(input.candidate_prompt === null || safeText(input.candidate_prompt,32768)) || !Array.isArray(input.source_messages) || input.source_messages.length > 40 || !Array.isArray(input.files) || input.files.length > 8 || !Array.isArray(input.turns) || input.turns.length > 64) return false
  let previous = -1
  if (!input.source_messages.every(m => closed(m,['id','role','sequence','truncated','text']) && idValid(m.id) && ['user','assistant'].includes(m.role) && Number.isInteger(m.sequence) && m.sequence > previous && m.sequence <= 2147483647 && (previous = m.sequence) >= 0 && typeof m.truncated === 'boolean' && safeText(m.text,131072))) return false
  if (!input.turns.every(t => closed(t,['role','text']) && ['user','assistant'].includes(t.role) && safeText(t.text,16384))) return false
  const ids = new Set(), images = input.files.filter(f=>f?.kind === 'image')
  if (images.length > 3) return false
  return input.files.every(f => {
    if (!idValid(f?.id) || ids.has(f.id) || !nameValid(f.name)) return false
    ids.add(f.id)
    if (prepared && f.kind === 'text') return closed(f,['id','kind','name','text']) && safeText(f.text,65536)
    if (!closed(f,['id','kind','name','mime','data_base64'])) return false
    return f.kind === 'text' ? !prepared && f.mime === 'text/plain' && base64Valid(f.data_base64,87384,65536) : f.kind === 'image' && ['image/png','image/jpeg','image/webp'].includes(f.mime) && base64Valid(f.data_base64,1398104,1048576)
  })
}
const sameRoute = (a, b) => !!a && !!b && a.connectionId === b.connectionId && a.profile === b.profile && a.targetProfile === b.targetProfile
const sameLabels = (a, b) => !!a && !!b && a.provider === b.provider && a.model === b.model
const sameIdentity = (a,b) => closed(a,['refinement_id','request_id','input_revision']) && !!b && a.refinement_id === b.refinement_id && a.request_id === b.request_id && a.input_revision === b.input_revision
const keyFor = (s, identity) => ['prompt-refiner', s.origin.route.connectionId, s.origin.route.profile, s.origin.storedId || null, identity.refinement_id, identity.request_id]
const envelope = response => {
  if (!closed(response,['ok','data']) || response.ok !== true || !response.data || typeof response.data !== 'object') throw new Error('invalid response')
  return response.data
}
const errors = {override_denied:'The host does not permit this model override.',incompatible_api:'Required Hermes plugin API is unavailable.',invalid_params:'Request fields or types are invalid.',too_large:'Input exceeds the refiner limits.',unsupported_type:'This file type is not supported.',invalid_encoding:'Text must be valid UTF-8.',invalid_image:'Image data is malformed or unsupported.',image_too_large:'Image dimensions exceed the refiner limit.',unsafe_input:'The host refused this input.',route_unconfigured:'Configure the independent refiner provider and model.',route_changed:'The configured refiner changed. Prepare a new preview.',image_not_confirmed:"Confirm this route's image compatibility in plugin settings.",preview_required:'Prepare and inspect a new preview before sending.',busy:'The refiner has no available request slot.',request_conflict:'This request identity already names different content.',job_not_found:'This job is unavailable.',timeout:'The model request timed out. Its remote outcome may be unknown.',model_failed:'The model request failed.',invalid_output:'The model response did not match the required format.',service_unloaded:'The refiner service is no longer available.',internal_error:'The refiner could not complete this operation.'}
const errorValid = e => closed(e,['code','message']) && typeof e.code === 'string' && Object.hasOwn(errors,e.code) && e.message === errors[e.code]
const failureValid = r => closed(r,['ok','error']) && r.ok === false && errorValid(r.error)
const limits = {max_files:8,max_images:3,max_text_file_bytes:65536,max_model_text_bytes:131072,max_image_bytes:1048576,max_image_pixels:4000000,max_rpc_bytes:6291456,max_candidate_bytes:32768,max_reply_bytes:16384,max_source_messages:40,max_turns:64,max_output_tokens:4096,max_running_jobs:2,max_retained_jobs:8,result_ttl_seconds:120}
const describeValid = d => closed(d,['configured_route','image_eligibility','host_fallback_unresolved','model_timeout_seconds','compatibility_baseline','limits','configured_reasoning_effort','execution_support']) && (d.configured_reasoning_effort === null || efforts.has(d.configured_reasoning_effort)) && closed(d.execution_support,['model_override','reasoning_effort']) && Object.values(d.execution_support).every(value=>typeof value === 'boolean') && (d.configured_route === null || labelsValid(d.configured_route)) && ['operator_confirmed','not_confirmed'].includes(d.image_eligibility) && d.host_fallback_unresolved === true && d.model_timeout_seconds === 90 && d.compatibility_baseline === '081e8d9b75b2bedae297a89232b04ef9be7b26a0' && closed(d.limits,Object.keys(limits)) && Object.entries(limits).every(([k,v])=>d.limits[k] === v)
const resultValid = r => closed(r,['assistant_reply','candidate_prompt','reported_route','usage','cost']) && safeText(r.assistant_reply,16384) && !!r.assistant_reply.trim() && (r.candidate_prompt === null || (safeText(r.candidate_prompt,32768) && !!r.candidate_prompt.trim())) && closed(r.reported_route,['provider','model']) && [r.reported_route.provider,r.reported_route.model].every(v=>v === null || labelValid(v)) && (r.usage === null || (closed(r.usage,['input_tokens','output_tokens','total_tokens','cache_read_tokens','cache_write_tokens']) && Object.values(r.usage).every(n=>Number.isSafeInteger(n) && n >= 0) && Object.values(r.usage).some(n=>n > 0))) && r.cost === null
const statusValid = d => closed(d,['identity','state','result','error']) && (d.state === 'succeeded' ? resultValid(d.result) && d.error === null : d.state === 'failed' ? d.result === null && errorValid(d.error) : ['pending','abandoned'].includes(d.state) && d.result === null && d.error === null)
const snapshotValue = value => { if (Array.isArray(value)) return Object.freeze(value.map(snapshotValue)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,snapshotValue(v)]))); return value }
const errorText = response => errorValid(response?.error) ? errors[response.error.code] : errors.internal_error
const initial = () => ({ origin:null, refinementId:null, revision:0, candidateRevision:0, draft:'', userInput:'', candidate:'', execution:{model_override:null,reasoning_effort:null}, selection:[], files:[], turns:[], prepared:null, routeInfo:null, routeState:'unknown', routeError:null, job:null, proposal:null, error:null, message:null, opening:false })

export function createController(dependencies) {
  const { captureOrigin, requestProfile, readSelectedFile, writeClipboard, queryClient: cache, newId, publish } = dependencies
  let state = initial(), generation = 0, routeGeneration = 0, disposed = false
  const emit = patch => { state = snapshotValue({ ...state, ...patch }); publish(state); return state }
  const live = g => !disposed && g === generation
  const invalidate = patch => {
    if (!state.origin || state.revision >= 2147483647) return emit({error:'Revision limit reached. Discard and open a new refinement.'})
    return emit({ ...patch, revision:state.revision + 1, prepared:null, error:state.routeError })
  }
  const rpc = async (origin, method, params) => {
    if (byteLength(JSON.stringify(params)) > 6291456) throw new Error('Input exceeds the refiner limits.')
    return requestProfile(origin.route, prefix + method, params)
  }
  const cleanJob = job => {
    if (!job) return
    const key = job.queryKey
    void Promise.resolve(cache.cancelQueries({queryKey:key, exact:true})).then(() => cache.removeQueries({queryKey:key, exact:true}))
    void rpc(job.origin, 'release', {protocol_version:1, identity:job.identity, handle:job.handle}).catch(() => {})
  }
  const effectiveRoute = () => state.execution.model_override || state.routeInfo?.configured_route || null
  async function refreshRoute() {
    if (!state.origin) return state
    const g = generation, origin = state.origin, routeRequest = ++routeGeneration
    emit({routeState:'loading',routeInfo:null,routeError:null,prepared:null})
    try {
      const result = await rpc(origin, 'describe', {protocol_version:2})
      if (!live(g) || routeRequest !== routeGeneration) return state
      if (result?.error?.code === -32601) return emit({routeState:'missing',routeError:errors.incompatible_api,error:errors.incompatible_api})
      if (failureValid(result)) return emit({routeState:'failed',routeError:errorText(result),error:errorText(result)})
      if (!closed(result,['ok','data']) || result.ok !== true || !describeValid(result.data)) return emit({routeState:'incompatible',routeError:'Invalid configured route response.',error:'Invalid configured route response.'})
      const data = result.data
      const changed = !sameLabels(state.routeInfo?.configured_route, data.configured_route) || state.routeInfo?.image_eligibility !== data.image_eligibility || state.routeInfo?.configured_reasoning_effort !== data.configured_reasoning_effort || JSON.stringify(state.routeInfo?.execution_support) !== JSON.stringify(data.execution_support)
      const execution = state.execution
      return emit({routeInfo:data, routeState:data.configured_route ? 'ready' : 'unconfigured', routeError:null, execution, prepared:changed || !sameExecution(execution,state.execution) ? null : state.prepared, error:(execution.model_override || data.configured_route) ? null : 'Configure the independent refiner provider and model.'})
    } catch (error) { if (live(g) && routeRequest === routeGeneration) { const text = error?.code === -32601 ? errors.incompatible_api : 'Route unavailable. Reopen from the intended chat.'; return emit({routeInfo:null,routeState:error?.code === -32601 ? 'missing' : 'failed',routeError:text,prepared:null,error:text}) } return state }
  }
  async function open() {
    if (disposed || state.opening) return state
    if (state.origin) return state
    const g = ++generation
    emit({opening:true, error:null})
    try {
      const origin = await captureOrigin()
      if (!live(g)) return state
      if (!origin?.route || typeof origin.draft !== 'string') return emit({opening:false, error:'Unable to capture the chat owner and draft. Reopen from the intended chat.'})
      emit({origin, draft:'', userInput:origin.draft, refinementId:newId(), opening:false})
      return await refreshRoute()
    } catch { if (live(g)) return emit({opening:false, error:'Unable to capture the chat owner and draft. Reopen from the intended chat.'}); return state }
  }
  function setInput(values) {
    if (state.job && Object.hasOwn(values, 'userInput')) return state
    const patch = {}
    if (Object.hasOwn(values, 'draft')) patch.draft = values.draft
    if (Object.hasOwn(values, 'userInput')) patch.userInput = values.userInput
    return invalidate(patch)
  }
  function setExecution(values) {
    if (state.job) return state
    if (!state.origin || !values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key=>!['model_override','reasoning_effort'].includes(key))) return emit({error:errors.invalid_params})
    const execution = {...state.execution, ...values}
    if (!executionValid(execution)) return emit({error:errors.invalid_params})
    if (execution.model_override !== null && !state.routeInfo?.execution_support.model_override) return emit({error:errors.incompatible_api})
    if (sameExecution(execution,state.execution)) return state
    return invalidate({execution})
  }
  async function setSelection(values) {
    if (!state.origin) return state
    const g = generation, revision = state.revision, selected = snapshotValue(values)
    try {
      const files = selected.fileSelections ? await Promise.all(selected.fileSelections.map(item => readSelectedFile(item))) : (selected.files ?? state.files)
      if (!live(g) || revision !== state.revision) return state
      return invalidate({selection: selected.messages ?? state.selection, files})
    } catch { if (live(g) && revision === state.revision) return emit({error:'File unavailable or unsupported. Reselect files.'}); return state }
  }
  function editCandidate(text) { return invalidate({candidate:text, candidateRevision:state.candidateRevision + 1}) }
  async function prepare() {
    if (!state.origin || state.job) return state
    if (!state.routeInfo) return emit({error:state.routeError || (state.routeState === 'loading' ? 'Loading model information…' : 'Model information unavailable. Refresh the route.')})
    if (!effectiveRoute()) return emit({error:'Configure the independent refiner route before preparing.'})
    const g = generation, revision = state.revision, routeRequest = routeGeneration, route = effectiveRoute(), execution = state.execution
    if (execution.model_override !== null && !state.routeInfo.execution_support.model_override) return emit({error:errors.incompatible_api})
    const input = {original_draft:state.draft, source_messages:state.selection, files:state.files, turns:state.turns, user_input:state.userInput, candidate_prompt:state.candidate || null}
    if (!inputValid(input,false)) return emit({error:'Input exceeds the refiner limits or is invalid.'})
    if (input.files.some(file=>file.kind === 'image') && (state.routeInfo.image_eligibility !== 'operator_confirmed' || !sameLabels(route,state.routeInfo.configured_route))) return emit({error:'Confirm this route’s image compatibility in plugin settings.'})
    emit({error:null, message:'Preparing preview…'})
    try {
      const response = await rpc(state.origin, 'prepare', {protocol_version:2, input_revision:revision, expected_route:route, input, execution})
      if (!live(g) || revision !== state.revision || routeRequest !== routeGeneration || !sameLabels(effectiveRoute(),route) || !sameExecution(state.execution,execution)) return state
      if (response?.error?.code === -32601) return emit({prepared:null, message:null, error:errors.incompatible_api})
      if (failureValid(response)) return emit({prepared:null, message:null, error:errorText(response)})
      const data = envelope(response)
      if (!closed(data,['input_revision','expected_route','prepared','preview_digest','redacted','execution']) || !sameExecution(data.execution,execution) || data.input_revision !== revision || !labelsValid(data.expected_route) || !sameLabels(data.expected_route, route) || !inputValid(data.prepared,true) || typeof data.redacted !== 'boolean' || typeof data.preview_digest !== 'string' || !/^[0-9a-f]{64}$/.test(data.preview_digest)) return emit({prepared:null, message:null, error:'Invalid preview response.'})
      return emit({prepared:data, message:null})
    } catch (error) { if (live(g) && revision === state.revision && routeRequest === routeGeneration && sameLabels(effectiveRoute(),route) && sameExecution(state.execution,execution)) return emit({prepared:null, message:null, error:error?.code === -32601 ? errors.incompatible_api : 'Preview upload failed. Check the captured route.'}); return state }
  }
  async function send() {
    if (!state.origin || state.job || !state.prepared || state.prepared.input_revision !== state.revision || !sameLabels(state.prepared.expected_route,effectiveRoute()) || !sameExecution(state.prepared.execution,state.execution)) return emit({error:'Prepare and inspect a new preview before sending.'})
    const g = generation, revision = state.revision, routeRequest = routeGeneration, prepared = state.prepared, origin = state.origin, candidateRevision = state.candidateRevision
    const identity = {refinement_id:state.refinementId, request_id:newId(), input_revision:revision}
    const queryKey = keyFor(state, identity)
    emit({prepared:null, message:'Starting request…', error:null, job:{starting:true, origin, identity}})
    try {
      const response = await rpc(origin, 'start', {protocol_version:2, identity, expected_route:prepared.expected_route, prepared:prepared.prepared, preview_digest:prepared.preview_digest, execution:prepared.execution})
      if (response?.error?.code === -32601 || failureValid(response)) { if (live(g) && state.job?.identity.request_id === identity.request_id) return emit({job:null, message:null, error:response?.error?.code === -32601 ? errors.incompatible_api : errorText(response)}); return state }
      const data = envelope(response), handle = data.handle
      if (!closed(data,['identity','handle']) || !sameIdentity(data.identity,identity) || !closed(handle,['job_id','result_capability']) || typeof handle.job_id !== 'string' || !/^[0-9a-f]{32}$/.test(handle.job_id) || typeof handle.result_capability !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(handle.result_capability)) throw new Error('invalid')
      const job = {origin, identity, handle, candidateRevision, queryKey, submittedInput:prepared.prepared.user_input}
      if (!live(g) || revision !== state.revision || routeRequest !== routeGeneration || !sameExecution(state.execution,prepared.execution) || !sameLabels(effectiveRoute(),prepared.expected_route)) { cleanJob(job); if (live(g) && state.job?.identity.request_id === identity.request_id) return emit({job:null,message:null}); return state }
      return emit({job, message:'Waiting for refiner…'})
    } catch (error) { if (live(g) && state.job?.identity.request_id === identity.request_id) return emit({job:null, message:null, error:error?.code === -32601 ? errors.incompatible_api : 'Start acknowledgement was not received. The request may have run; a new attempt may incur model use.'}); return state }
  }
  function acceptStatus(response, identity) {
    const job = state.job
    if (!job?.handle || !sameIdentity(identity,job.identity)) return state
    if (failureValid(response)) {
      if (['job_not_found','service_unloaded'].includes(response.error.code)) {
        cleanJob(job)
        return emit({job:null, prepared:null, message:null, error:`${errorText(response)} Prepare a fresh preview before trying again; the previous request may have run.`})
      }
      return emit({error:errorText(response)})
    }
    let data
    try { data = envelope(response) } catch { return emit({error:'Invalid job status.'}) }
    if (!statusValid(data) || !sameIdentity(data.identity,job.identity)) return emit({error:'Invalid job status.'})
    if (data.state === 'pending') return state
    if (!['succeeded','failed','abandoned'].includes(data.state)) return emit({error:'Invalid job status.'})
    cleanJob(job)
    if (data.state !== 'succeeded') return emit({job:null, message:null, error:data.state === 'failed' ? errorText({error:data.error}) : 'The request did not return a usable result.'})
    const result = data.result, turns = [...state.turns, {role:'user',text:job.submittedInput}, {role:'assistant',text:result.assistant_reply}]
    const patch = {job:null, turns, userInput:'', message:null, reportedRoute:result.reported_route, error:null, prepared:null}
    if (result.candidate_prompt !== null) {
      if (job.candidateRevision === state.candidateRevision && job.identity.input_revision === state.revision) patch.candidate = result.candidate_prompt
      else patch.proposal = result.candidate_prompt
    }
    return emit(patch)
  }
  function applyProposal() { if (state.proposal === null) return state; return invalidate({candidate:state.proposal, proposal:null, candidateRevision:state.candidateRevision + 1}) }
  async function copy() {
    const g = generation, candidate = state.candidate
    if (!candidate || !safeText(candidate,32768)) return emit({error:'No valid candidate to copy.'})
    try { const ok = await writeClipboard(candidate); if (live(g)) return emit(ok === true ? {message:'Copied prompt. Paste it and reattach any required files yourself.', error:null} : {error:'Clipboard unavailable. Select text manually.'}) } catch { if (live(g)) return emit({error:'Clipboard unavailable. Select text manually.'}) }
    return state
  }
  function discard() { generation++; const job = state.job; state = snapshotValue(initial()); publish(state); cleanJob(job?.handle ? job : null); return state }
  function dispose() { if (disposed) return state; discard(); disposed = true; return state }
  return {open, setInput, setExecution, effectiveRoute, setSelection, editCandidate, prepare, send, acceptStatus, applyProposal, copy, discard, dispose, refreshRoute, getState:() => state}
}

function snapshot() {
  const owner = host.state.focusedSessionOwner.get()
  return {owner:owner && {connectionId:owner.connectionId, profile:owner.profile}, storedId:host.state.focusedStoredSessionId.get(), runtimeId:host.state.focusedSessionId.get(), epoch:gatewayActivationEpoch()}
}
function sameSnapshot(a,b) { return a.owner?.connectionId === b.owner?.connectionId && a.owner?.profile === b.owner?.profile && a.storedId === b.storedId && a.runtimeId === b.runtimeId && a.epoch === b.epoch }
async function captureOrigin(metadata, refreshMetadata) {
  const before = snapshot(), cached = metadata.get()
  if (!cached.routes || cached.epoch !== before.epoch) { void refreshMetadata(); throw new Error('capture') }
  if (!before.owner?.connectionId || !before.owner?.profile || (!before.storedId && before.runtimeId)) throw new Error('capture')
  const matching = cached.routes.filter(r => r.connectionId === before.owner.connectionId && r.profile === before.owner.profile && r.targetProfile)
  if (matching.length !== 1) { void refreshMetadata(); throw new Error('capture') }
  const draft = before.storedId ? await host.composer.getDraft(before.storedId) : ''
  let afterRoutes
  try { afterRoutes = await host.profileRoutes() } catch { void refreshMetadata(); throw new Error('capture') }
  if (!Array.isArray(afterRoutes) || afterRoutes.filter(r => r.connectionId === before.owner.connectionId && r.profile === before.owner.profile && r.targetProfile).length !== 1 || !afterRoutes.some(r => sameRoute(r,matching[0])) || !sameSnapshot(before,snapshot()) || typeof draft !== 'string') { void refreshMetadata(); throw new Error('capture') }
  return {route:matching[0], storedId:before.storedId, runtimeId:before.runtimeId, draft}
}
async function routed(route, method, params) {
  const routes = await host.profileRoutes()
  if (routes.filter(r => sameRoute(route,r)).length !== 1) throw new Error('route unavailable')
  return host.requestProfile(route, method, params)
}

function imageDimensions(bytes, mime) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mime === 'image/png' && bytes.length >= 24 && String.fromCharCode(...bytes.slice(12,16)) === 'IHDR') return [v.getUint32(16),v.getUint32(20)]
  if (mime === 'image/webp' && bytes.length >= 30) {
    const kind = String.fromCharCode(...bytes.slice(12,16))
    if (kind === 'VP8X') return [1 + v.getUint8(24) + (v.getUint8(25) << 8) + (v.getUint8(26) << 16),1 + v.getUint8(27) + (v.getUint8(28) << 8) + (v.getUint8(29) << 16)]
    if (kind === 'VP8L' && bytes[20] === 47) { const n = v.getUint32(21,true); return [(n & 16383) + 1,((n >>> 14) & 16383) + 1] }
    if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return [v.getUint16(26,true) & 16383,v.getUint16(28,true) & 16383]
  }
  if (mime === 'image/jpeg') {
    let i = 2
    while (i + 4 <= bytes.length && bytes[i] === 255) {
      while (bytes[i] === 255) i++
      const marker = bytes[i++]
      if (marker === 218 || marker === 217) break
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue
      if (i + 2 > bytes.length) break
      const length = v.getUint16(i)
      if (length < 2 || i + length > bytes.length) break
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) return [v.getUint16(i + 5),v.getUint16(i + 3)]
      i += length
    }
  }
  throw new Error('image header')
}

async function readFile(ctx, item) {
  const name = item.name, ext = name.split('.').pop().toLowerCase(), imageMime = imageExtensions[ext], text = textExtensions.has(ext)
  if ((!text && !imageMime) || name === '.' || name === '..' || /[/\\\x00-\x1f\x7f-\x9f]/.test(name) || byteLength(name) > 255) throw new Error('type')
  const stat = await ctx.files.stat(item.folder, item.path), max = text ? 65536 : 1048576
  if (!stat.ok || !stat.exists || stat.isDirectory !== false || !Number.isInteger(stat.size) || stat.size < 0 || stat.size > max) throw new Error('stat')
  const result = await ctx.files.readDataUrl(item.folder,item.path)
  const match = result.ok && /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(result.url)
  if (!match || !base64Valid(match[2],text ? 87384 : 1398104,max)) throw new Error('encoding')
  const raw = atob(match[2]); if (btoa(raw) !== match[2] || raw.length !== stat.size || raw.length > max) throw new Error('size')
  const bytes = Uint8Array.from(raw, x => x.charCodeAt(0))
  const starts = a => a.every((v,i) => bytes[i] === v)
  const png = starts([137,80,78,71,13,10,26,10]), jpeg = starts([255,216,255]), webp = raw.slice(0,4) === 'RIFF' && raw.slice(8,12) === 'WEBP'
  if (text) {
    const lead = raw.slice(0,1024).replace(/^[\x09\x0a\x0b\x0c\x0d\x20]*/, '')
    if (lead.startsWith('%PDF-') || /^PK[\x03\x05\x07][\x04\x06\x08]/.test(raw) || starts([208,207,17,224,161,177,26,225]) || starts([31,139]) || raw.startsWith('BZh') || starts([253,55,122,88,90,0]) || starts([55,122,188,175,39,28]) || raw.startsWith('Rar!\x1a\x07') || raw.slice(257,262) === 'ustar' || png || jpeg || webp || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw)) throw new Error('type')
    new TextDecoder('utf-8',{fatal:true}).decode(bytes)
  } else if (match[1] !== imageMime || !(imageMime === 'image/png' ? png : imageMime === 'image/jpeg' ? jpeg : webp)) throw new Error('image')
  if (!text) {
    const [width,height] = imageDimensions(bytes,imageMime)
    if (!width || !height || width * height > 4000000) throw new Error('image dimensions')
    const bitmap = await createImageBitmap(new Blob([bytes], {type:imageMime}))
    const pixels = bitmap.width * bitmap.height
    bitmap.close()
    if (!Number.isSafeInteger(pixels) || pixels > 4000000) throw new Error('image dimensions')
  }
  return {id:crypto.randomUUID(), kind:text ? 'text' : 'image', name, mime:text ? 'text/plain' : imageMime, data_base64:match[2]}
}

function Panel({controller, store, ctx}) {
  const s = useValue(store)
  const [history, setHistory] = useState([])
  const [cursor, setCursor] = useState(null)
  const [historyError, setHistoryError] = useState(null)
  const [folder, setFolder] = useState(null)
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState([])
  const [fileError, setFileError] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [inputHeight, setInputHeight] = useState(28)
  const inputRef = useRef(null)
  const drag = useRef(null)
  const manualHeight = useRef(28)
  const owner = s.origin?.route, refinementId = s.refinementId
  const job = s.job?.handle ? s.job : null
  const status = useQuery({
    queryKey:job ? job.queryKey : ['prompt-refiner','idle'],
    queryFn:() => routed(job.origin.route, prefix + 'status', {protocol_version:1, identity:job.identity, handle:job.handle}),
    enabled:!!job, refetchInterval:3000, retry:false
  })
  useEffect(() => { if (job && status.data) controller.acceptStatus(status.data, job.identity) }, [status.data, job?.identity.request_id])
  useEffect(() => { setHistory([]); setCursor(null); setHistoryError(null); setFolder(null); setPath(''); setEntries([]); setDialog(null); setAddOpen(false); setModelOpen(false); manualHeight.current=28; setInputHeight(28) }, [s.refinementId])
  useEffect(() => { manualHeight.current=28; setInputHeight(28) }, [s.turns.length])
  useEffect(() => {
    const el=inputRef.current
    if (!el) return
    el.style.height='28px'
    setInputHeight(Math.max(manualHeight.current,Math.min(160,el.scrollHeight)))
  }, [s.userInput,s.refinementId,s.turns.length])
  async function loadHistory(earlier) {
    const current = controller.getState(), id = current.refinementId
    if (current.refinementId !== refinementId || !current.origin?.storedId) return
    try {
      const params = {session_id:current.origin.storedId, limit:100, order:'latest', inline_images:false}
      if (earlier && cursor) params.cursor = cursor
      const page = await routed(current.origin.route,'session.transcript',params)
      if (controller.getState().refinementId !== id) return
      if (!page || !Array.isArray(page.rows) || typeof page.reset !== 'boolean') throw new Error('history')
      if (earlier && page.reset) {
        setHistory([]); setCursor(null); await controller.setSelection({messages:[]}); setHistoryError('History changed. Refresh and select messages again.'); return
      }
      const rows = page.rows.map(row => ({...row, localId:crypto.randomUUID()}))
      setHistory(old => earlier ? [...rows, ...old] : rows)
      setCursor(page.next_cursor || null); setHistoryError(null)
      if (!earlier) await controller.setSelection({messages:[]})
    } catch { if (controller.getState().refinementId === id) setHistoryError('History unavailable. Refresh history or reopen from the intended chat.') }
  }
  function selectHistory(row, checked) {
    if (controller.getState().refinementId !== refinementId) return
    const selected = new Set(controller.getState().selection.map(x => x.id))
    if (checked) selected.add(row.localId); else selected.delete(row.localId)
    const messages = history.filter(r => selected.has(r.localId) && r.row_kind === 'message' && ['user','assistant'].includes(r.role) && typeof r.text === 'string').map((r,sequence) => ({id:r.localId, role:r.role, sequence, truncated:r.truncated === true, text:r.text}))
    void controller.setSelection({messages})
  }
  async function openFolder() {
    const id = controller.getState().refinementId
    if (id !== refinementId) return
    try {
      if (!ctx.files?.requestFolder) throw new Error('unavailable')
      const result = await ctx.files.requestFolder()
      if (controller.getState().refinementId !== id) return
      if (!result.ok) throw new Error('refused')
      if (result.folder) { setFolder(result.folder); await listFolder(result.folder,'',id) }
    } catch { if (controller.getState().refinementId === id) setFileError('Folder access unavailable. Reselect files.') }
  }
  async function listFolder(f,p,id) {
    if (id !== refinementId || controller.getState().refinementId !== id) return
    try {
      const result = await ctx.files.list(f.id,p)
      if (controller.getState().refinementId !== id) return
      if (!result.ok || !Array.isArray(result.entries)) throw new Error('list')
      setFolder(f); setPath(p); setEntries(result.entries); setFileError(result.truncated ? 'Folder listing is incomplete.' : null)
    } catch { if (controller.getState().refinementId === id) setFileError('Folder unavailable. Reselect files.') }
  }
  async function addFile(entry) {
    const now = controller.getState(), id = now.refinementId, revision = now.revision
    if (id !== refinementId || !folder) return
    try {
      const f = await readFile(ctx,{folder:folder.id,path:entry.path,name:entry.name})
      if (controller.getState().refinementId !== id || controller.getState().revision !== revision) return
      await controller.setSelection({files:[...now.files, f]}); setFileError(null)
    } catch { if (controller.getState().refinementId === id) setFileError('File unavailable, unsafe, too large or unsupported. Reselect files.') }
  }
  const button = (label, onClick, disabled = false) => jsx(Button,{type:'button',variant:'secondary',onClick,disabled,children:label})
  const field = (label, value, onChange, disabled = false) => jsxs('label',{className:'flex flex-col gap-1',children:[label,jsx(Textarea,{value,onChange:e => onChange(e.target.value),disabled})]})
  const textFilePreview = f => { try { return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(f.data_base64), x => x.charCodeAt(0))) } catch { return '' } }
  const showFile = f => jsxs('div',{className:'flex flex-col gap-1',children:[jsx('div',{children:`${f.name} · ${f.kind} · ${f.kind === 'image' ? f.mime : 'text/plain'} · ${f.data_base64 ? atob(f.data_base64).length : byteLength(f.text)} bytes`}),f.kind === 'image' ? jsx('img',{src:`data:${f.mime};base64,${f.data_base64}`,alt:f.name,className:'max-h-48 max-w-full object-contain'}) : jsx('pre',{className:'whitespace-pre-wrap break-words',children:f.text ?? textFilePreview(f)})]},f.id)
  if (!s.origin) return jsx('div',{className:'flex h-full min-h-0 flex-col text-sm',style:{fontFamily:'var(--dt-font-sans)'},children:jsxs('main',{className:'grid min-h-0 flex-1 place-items-center p-4 text-(--ui-text-tertiary)',children:[jsx('div',{className:'text-base',children:'Refine your prompt'}),s.error && jsx('p',{role:'alert',children:s.error})]})})
  const route = s.routeInfo ? s.execution.model_override || s.routeInfo.configured_route : null
  const support = s.routeInfo?.execution_support
  const sameDiscussion = current => current.refinementId === refinementId && !!current.origin && sameRoute(current.origin.route,owner)
  const canEdit = current => sameDiscussion(current) && !current.job
  const canUseModelMenu = current => sdk.MODEL_CATALOG_CAPABILITIES?.selectionOnly === true && canEdit(current)
  const menuController = {
    allowSpeed:false,
    current:{model:route?.model || '',provider:route?.provider || '',effort:'',effortPending:true,fast:false},
    presetFor:()=>({}),
    select:(model,provider)=>{ const current=controller.getState(); if (canUseModelMenu(current) && current.routeInfo?.execution_support.model_override) controller.setExecution({model_override:{model,provider}}) },
    applyPreset:()=>{},
    setOptions:()=>{}
  }
  const resize = value => { const height = Math.max(28,Math.min(160,value)); manualHeight.current = height; setInputHeight(height) }
  const chevron = jsx('svg',{viewBox:'0 0 12 12','aria-hidden':true,children:jsx('path',{d:'m3 4.5 3 3 3-3'})})
  const menu = jsxs('div',{className:'pr-route-controls',children:[
    jsx(DropdownMenu,{open:modelOpen && canUseModelMenu(s),onOpenChange:open=>{if (!open || canUseModelMenu(controller.getState())) setModelOpen(open)},children:jsxs('div',{children:[jsx(DropdownMenuTrigger,{asChild:true,children:jsxs('button',{type:'button',className:'pr-route-pill',disabled:!canUseModelMenu(s) || (!support?.model_override && !s.execution.model_override),'aria-label':'Refiner model for this conversation',title:'Only this conversation',children:[jsx('span',{children:route?.model || 'Model unavailable'}),chevron]})}),modelOpen && canUseModelMenu(s) && jsx(DropdownMenuContent,{align:'end',className:'w-72 p-0',children:jsxs(ModelMenuCloseContext.Provider,{value:()=>setModelOpen(false),children:[jsx(DropdownMenuItem,{onSelect:()=>{const current=controller.getState();if(canUseModelMenu(current)) controller.setExecution({model_override:null})},children:'Use configured refiner'}),jsx(ModelCatalogMenu,{selectionOnly:true,controller:menuController,request:async(method,params)=>{if(!sameDiscussion(controller.getState())) throw new Error('discussion ended');if(!canUseModelMenu(controller.getState())) throw new Error('model catalog unavailable');const result=await routed(owner,method,params);if(!sameDiscussion(controller.getState())) throw new Error('discussion ended');if(!canUseModelMenu(controller.getState())) throw new Error('model catalog unavailable');return result},ownerConnectionId:owner.connectionId,profile:owner.targetProfile})]})})]})})
  ]})
  const contextDialog = jsxs('div',{className:'space-y-2',children:[jsx('p',{children:'Stored display projection may be incomplete or truncated. Compaction and tool rows cannot be selected. Attachments are not fetched.'}),s.origin.storedId ? button('Refresh history',()=>void loadHistory(false)) : jsx('p',{children:'No stored chat is available.'}),cursor && button('Load earlier',()=>void loadHistory(true)),historyError && jsx('p',{role:'alert',children:historyError}),...history.map(row=>jsxs('div',{className:'my-2',children:[row.row_kind === 'message' && ['user','assistant'].includes(row.role) && typeof row.text === 'string' ? jsx(Checkbox,{checked:s.selection.some(m=>m.id===row.localId),onCheckedChange:value=>selectHistory(row,value === true),'aria-label':`Select ${row.role} message`}) : null,jsx('span',{children:` ${row.role || row.row_kind}${row.truncated ? ' (truncated)' : ''}`}),jsx('pre',{className:'whitespace-pre-wrap break-words',children:typeof row.text === 'string' ? row.text : '[non-selectable entry]'})]},row.localId))]})
  const fileDialog = jsxs('div',{className:'space-y-2',children:[jsx('p',{children:'Folder access persists until revoked in Capabilities → Plugins → Folder access. Only selected files are read. PDF and Office files are not supported.'}),button('Choose folder',()=>void openFolder()),fileError && jsx('p',{role:'alert',children:fileError}),folder && jsxs('div',{children:[jsx('p',{children:`${folder.name}${path ? ` / ${path}` : ''}`}),path && button('Up',()=>void listFolder(folder,path.split('/').slice(0,-1).join('/'),s.refinementId)),...entries.filter(entry=>entry.isDirectory || (dialog === 'Images' ? !!imageExtensions[entry.name.split('.').pop().toLowerCase()] : !imageExtensions[entry.name.split('.').pop().toLowerCase()])).map(entry=>button(entry.isDirectory ? `${entry.name}/` : `Add ${entry.name}`,()=>entry.isDirectory ? void listFolder(folder,entry.path,s.refinementId) : void addFile(entry)))]})]})
  const reviewText = (label,text) => text ? jsxs('section',{children:[jsx('strong',{children:label}),jsx('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'},children:text})]}) : null
  const reviewInput = input => [reviewText('Message',input.user_input),reviewText('Candidate',input.candidate_prompt),reviewText('Draft',input.original_draft),...input.turns.map(t=>reviewText(t.role === 'user' ? 'You' : 'Refiner',t.text)),...input.source_messages.map(m=>reviewText(`${m.role}${m.truncated ? ' (truncated)' : ''}`,m.text)),...input.files.map(showFile)]
  const review = jsxs('div',{className:'space-y-3',children:[jsx('p',{children:route ? `Model: ${route.provider} / ${route.model}` : s.routeState === 'unconfigured' ? 'No model configured' : s.routeState === 'loading' ? 'Loading model information…' : 'Model unavailable'}),jsx('p',{children:warning}),jsx('p',{children:'Prepare preview uploads selected content to Hermes for checking. Send to refiner sends it to a model provider and may incur costs.'}),jsx('h3',{children:'Your request'}),...reviewInput({user_input:s.userInput,candidate_prompt:s.candidate,original_draft:s.draft,turns:s.turns,source_messages:s.selection,files:s.files}),button('Refresh route',()=>{if(sameDiscussion(controller.getState()))void controller.refreshRoute()}),button('Prepare preview',()=>{if(canEdit(controller.getState()))void controller.prepare()},!!s.job),s.prepared && jsxs('div',{className:'space-y-2',children:[jsx('h3',{children:'Prepared preview'}),jsx('p',{children:s.prepared.redacted ? 'Text was redacted.' : 'No text redaction reported.'}),...reviewInput(s.prepared.prepared),button('Send to refiner',()=>{if(canEdit(controller.getState())){void controller.send();setDialog(null)}},!!s.job)]}),s.error && jsx('p',{role:'alert',children:s.error})]})
  return jsxs('div',{className:'flex h-full min-h-0 flex-col overflow-hidden text-sm',style:{fontFamily:'var(--dt-font-sans)'},children:[jsx('style',{children:`.pr-composer{container-type:inline-size}.pr-box{background:var(--composer-fill)}.pr-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto 28px;align-items:center;gap:6px}.pr-route-controls{display:flex;align-items:center;min-width:0;gap:4px}.pr-route-pill{display:inline-flex;align-items:center;gap:4px;height:var(--composer-control-size,1.5rem);min-width:0;max-width:180px;padding:0 8px;border:0;border-radius:6px;background:transparent;font-family:inherit;font-size:var(--text-xs,.75rem);line-height:var(--text-xs--line-height,1rem);font-weight:400;color:var(--ui-text-tertiary);white-space:nowrap}.pr-route-pill:hover{background:var(--chrome-action-hover)}.pr-route-pill span{overflow:hidden;text-overflow:ellipsis}.pr-route-pill svg{width:10px;height:10px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5}.pr-input{display:block;width:100%;min-width:0;margin:0;padding:5px 0 3px;border:0;outline:none;background:transparent;box-shadow:none;resize:none;overflow-y:auto;line-height:20px;font-size:14px}.pr-send{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:var(--dt-foreground);color:var(--dt-background);line-height:0}.pr-send svg{display:block;padding:0}.pr-add{display:grid;place-items:center;width:24px;height:28px;padding:0;border:0;background:transparent}.pr-grip{position:absolute;left:50%;top:-7px;z-index:1;width:48px;height:12px;transform:translateX(-50%);padding:0;border:0;background:transparent;cursor:ns-resize;touch-action:none}.pr-chip{display:flex;align-items:center;gap:6px;max-width:230px;min-width:0}.pr-chip-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pr-thumb{width:32px;height:32px;object-fit:cover;flex:none}@container(max-width:440px){.pr-row{grid-template-columns:24px minmax(0,1fr) 28px}.pr-route-controls{grid-column:2;grid-row:2}.pr-send{grid-column:3;grid-row:1}}`}),
    jsx('header',{style:{display:'flex',justifyContent:'flex-end',padding:'4px 8px',borderBottom:'1px solid var(--ui-stroke-secondary)'},children:jsx(Button,{type:'button',variant:'ghost',size:'icon-xs','aria-label':'Discard refinement',title:'Discard refinement',onClick:()=>{if(sameDiscussion(controller.getState()))controller.discard()},children:jsx(sdk.Codicon,{name:'trash'})})}),
    jsxs('main',{className:'min-h-0 flex-1 overflow-auto p-4',children:[!s.turns.length && !s.candidate && jsx('div',{className:'grid h-full place-items-center text-base text-(--ui-text-tertiary)',children:'Refine your prompt'}),...s.turns.map((turn,i)=>jsxs('div',{className:'mb-4',children:[jsx('strong',{children:turn.role === 'user' ? 'You' : 'Refiner'}),jsx('pre',{className:'whitespace-pre-wrap break-words',children:turn.text})]},i)),s.reportedRoute && jsx('p',{className:'text-xs text-(--ui-text-tertiary)',children:`Reported by Hermes: ${s.reportedRoute.provider || 'unknown'} / ${s.reportedRoute.model || 'unknown'}`}),s.candidate && jsxs('div',{className:'mt-4 space-y-2',children:[field('Candidate prompt',s.candidate,v=>{if(sameDiscussion(controller.getState()))controller.editCandidate(v)}),button('Copy prompt',()=>{if(sameDiscussion(controller.getState()))void controller.copy()})]}),s.proposal !== null && jsxs('div',{children:[jsx('p',{children:'A new proposal arrived after your edit:'}),jsx('pre',{className:'whitespace-pre-wrap break-words',children:s.proposal}),button('Apply proposal',()=>{if(sameDiscussion(controller.getState()))controller.applyProposal()})]}),status.isError && jsx('p',{role:'alert',children:'Status unavailable. The request may still be running.'}),s.message && jsx('p',{children:s.message}),s.error && jsx('p',{role:'alert',children:s.error})]}),
    jsxs('div',{className:'p-3 pr-composer',children:[jsxs('div',{className:'relative rounded-md border border-(--ui-stroke-secondary) p-2 pr-box',children:[jsx('button',{type:'button',role:'separator','aria-label':'Resize message input','aria-orientation':'horizontal','aria-valuemin':28,'aria-valuemax':160,'aria-valuenow':inputHeight,className:'pr-grip',onPointerDown:e=>{if(e.button!==0)return;drag.current={pointer:e.pointerId,y:e.clientY,height:inputHeight};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault()},onPointerMove:e=>{if(drag.current?.pointer===e.pointerId)resize(drag.current.height+drag.current.y-e.clientY)},onPointerUp:()=>{drag.current=null},onPointerCancel:()=>{drag.current=null},onLostPointerCapture:()=>{drag.current=null},onKeyDown:e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();resize(e.key==='Home'?28:e.key==='End'?160:inputHeight+(e.key==='ArrowUp'?20:-20))},children:jsx('span',{style:{display:'block',width:'26px',height:'2px',margin:'auto',borderRadius:'2px',background:'var(--ui-stroke-secondary)'}})}),
      (s.selection.length > 0 || s.files.length > 0) && jsxs('div',{className:'mb-2 flex flex-wrap gap-2',children:[s.selection.length > 0 && jsxs('div',{className:'rounded border border-(--ui-stroke-secondary) p-2',children:[`${s.selection.length} chat messages `,button('Remove context',()=>{if(sameDiscussion(controller.getState()))void controller.setSelection({messages:[]})})]}),...s.files.map(f=>jsxs('div',{className:'pr-chip rounded border border-(--ui-stroke-secondary) p-2',children:[f.kind === 'image' && jsx('img',{className:'pr-thumb',src:`data:${f.mime};base64,${f.data_base64}`,alt:f.name}),jsx('span',{className:'pr-chip-name',children:f.name}),button(`Remove ${f.name}`,()=>{const current=controller.getState();if(sameDiscussion(current))void controller.setSelection({files:current.files.filter(item=>item.id!==f.id)})})]},f.id))]}),
      jsxs('div',{className:'pr-row',children:[jsx(DropdownMenu,{open:addOpen,onOpenChange:setAddOpen,children:jsxs('div',{children:[jsx(DropdownMenuTrigger,{asChild:true,children:jsx('button',{type:'button','aria-label':'Add context or attachments',className:'pr-add',children:'+'})}),addOpen && jsx(DropdownMenuContent,{children:['Chat context','Files','Images'].map(label=>jsx(DropdownMenuItem,{onSelect:()=>{if(!sameDiscussion(controller.getState()))return;setAddOpen(false);setDialog(label)},children:label},label))})]})}),jsx(Textarea,{ref:inputRef,rows:1,value:s.userInput,placeholder:'Message the refiner…','aria-label':'Message the refiner',disabled:!!s.job,className:'pr-input min-w-0 resize-none border-0 bg-transparent shadow-none',style:{height:`${inputHeight}px`,minHeight:'28px',maxHeight:'160px'},onChange:e=>{if(!canEdit(controller.getState()))return;controller.setInput({userInput:e.target.value});e.target.style.height='28px';setInputHeight(Math.max(manualHeight.current,Math.min(160,e.target.scrollHeight)))}}),menu,jsx('button',{type:'button','aria-label':'Send',disabled:!!s.job,onClick:()=>{if(!controller.getState().job)setDialog('Review request')},className:'pr-send',children:jsx('svg',{viewBox:'0 0 24 24',width:16,height:16,fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round',children:jsx('path',{d:'M12 20V4M5 11l7-7 7 7'})})})]})]})]}),
    dialog && jsx(Dialog,{open:true,onOpenChange:open=>{if(!open)setDialog(null)},children:jsxs(DialogContent,{className:'max-h-[85vh] overflow-auto',children:[jsx(DialogTitle,{children:dialog}),dialog === 'Chat context' ? contextDialog : dialog === 'Files' || dialog === 'Images' ? fileDialog : review,button('Done',()=>setDialog(null))]})})
  ]})
}

export default {
  id:'prompt-refiner', name:'Prompt Refiner (Desktop)', defaultEnabled:false,
  register(ctx) {
    const store = atom(initial()), metadata = atom({epoch:null, routes:null, loading:false})
    let disposed = false, metadataGeneration = 0, closeWorkspace = null
    async function refreshMetadata() {
      if (disposed) return
      const epoch = gatewayActivationEpoch(), generation = ++metadataGeneration
      metadata.set({epoch:null, routes:null, loading:true})
      try {
        const routes = await host.profileRoutes()
        if (!disposed && generation === metadataGeneration) metadata.set(Array.isArray(routes) && epoch === gatewayActivationEpoch() ? {epoch, routes:snapshotValue(routes), loading:false} : {epoch:null, routes:null, loading:false})
      } catch { if (!disposed && generation === metadataGeneration) metadata.set({epoch:null, routes:null, loading:false}) }
    }
    const controller = createController({captureOrigin:()=>captureOrigin(metadata,refreshMetadata), requestProfile:routed, readSelectedFile:item=>readFile(ctx,item), writeClipboard:text=>ctx.os.writeClipboard(text), queryClient, newId:()=>crypto.randomUUID(), publish:value=>store.set(value)})
    function Action() {
      const current = useValue(metadata), ready = !!current.routes && current.epoch === gatewayActivationEpoch()
      return jsxs('div',{children:[jsx(Button,{type:'button',disabled:!ready,onClick:()=>{ if (disposed) return; if (!metadata.get().routes || metadata.get().epoch !== gatewayActivationEpoch()) { void refreshMetadata(); return } if (typeof host.openWorkspace !== 'function' || typeof host.revealPane !== 'function') { host.notify({kind:'error',message:'This Hermes Desktop cannot open the refiner pane.'}); return } if (closeWorkspace) host.revealPane('plugin-workspace:prompt-refiner'); else { try { closeWorkspace = host.openWorkspace('prompt-refiner',{title:'Prompt Refiner',dock:{pane:'workspace',pos:'right'},minWidth:'22rem',render:()=>jsx(Panel,{controller,store,ctx}),onClose:()=>{closeWorkspace=null}}) } catch { host.notify({kind:'error',message:'Could not open the refiner pane.'}); return } } void controller.open() },children:'Refine'}),!ready && jsx(Button,{type:'button',disabled:current.loading,onClick:()=>void refreshMetadata(),children:current.loading ? 'Loading routes…' : 'Retry routes'})]})
    }
    ctx.register({id:'refine',area:COMPOSER_AREAS.actions,render:()=>jsx(Action,{})})
    ctx.onDispose(()=>{ disposed = true; metadataGeneration++; controller.dispose(); if (closeWorkspace) { const close=closeWorkspace; closeWorkspace=null; close() } })
    void refreshMetadata()
  }
}