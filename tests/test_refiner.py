import base64
import copy
import json
import unittest
from types import SimpleNamespace

import refiner

ROUTE = {"provider": "openai-codex", "model": "fixture-model"}
PREPARED = {"original_draft": "Bitte erkläre ./build.sh; nicht ausführen.", "source_messages": [{"id": "11111111-1111-4111-8111-111111111111", "role": "user", "sequence": 0, "truncated": False, "text": "Nur erklären."}], "files": [{"id": "22222222-2222-4222-8222-222222222222", "kind": "text", "name": "notes.txt", "text": "Keine Builds.\n"}], "turns": [{"role": "user", "text": "Deutsch bitte."}, {"role": "assistant", "text": "Gern."}], "user_input": "Formuliere die Anfrage präzise.", "candidate_prompt": None}
DIGEST = "79889f9889d6f4310b7bf53af6ca468ab1fd6e9b2f4a870d816938fb5acb7e99"
IDENTITY = {"refinement_id": "33333333-3333-4333-8333-333333333333", "request_id": "44444444-4444-4444-8444-444444444444", "input_revision": 2}
GERMAN_WORDING = 'Erkläre, was ./build.sh macht. Führe das Skript nicht aus und starte keine Builds.'


def draft(summary, wording, language='en'):
    return {'language': language, 'scope_summary': summary, 'task_wording': wording}


class RefinerTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.serial = 0
        self.queue = []
        self.calls = []
        self.route = dict(ROUTE)
        self.attestation = {}
        self.redact = lambda x: x
        self.response = SimpleNamespace(text=json.dumps(draft('Das Skript erklären, ohne es auszuführen.', GERMAN_WORDING, 'de')), provider="example", model="reported", usage=SimpleNamespace(input_tokens=3))
        def random_bytes(n):
            self.serial += 1
            return self.serial.to_bytes(n, "big")
        def model(**kwargs):
            self.calls.append(kwargs)
            return self.response
        self.service = refiner.RefinerService(model_complete=model, read_route=lambda: self.route, read_image_attestation=lambda: self.attestation, redact_text=lambda x: self.redact(x), monotonic=lambda: self.now, random_bytes=random_bytes, launch_worker=self.queue.append)

    def tearDown(self):
        self.service.unload()

    def raw(self):
        value = copy.deepcopy(PREPARED)
        f = value["files"][0]
        f["data_base64"] = base64.b64encode(f.pop("text").encode()).decode()
        f["mime"] = "text/plain"
        return value

    def prepare(self, value=None):
        return self.service.prepare({"protocol_version": 1, "input_revision": 2, "expected_route": ROUTE, "input": value if value is not None else self.raw()})

    def start(self, identity=None, prepared=None, digest=DIGEST):
        return self.service.start({"protocol_version": 1, "identity": identity or IDENTITY, "expected_route": ROUTE, "prepared": prepared or PREPARED, "preview_digest": digest})

    def request(self, data):
        return {"protocol_version": 1, **data}

    def error(self, response, code):
        self.assertEqual(response, {"ok": False, "error": {"code": code, "message": refiner.MESSAGES[code]}})

    def run_turn(self, value, refinement_id=IDENTITY['refinement_id'], *, protocol_version=1):
        execution = {'model_override': None, 'reasoning_effort': None}
        preview = self.prepare(value) if protocol_version == 1 else self.v2_prepare(execution, value=value)
        self.assertTrue(preview['ok'], preview)
        prepared = preview['data']
        identity = dict(IDENTITY, refinement_id=refinement_id, request_id=f'{self.serial:08x}-4444-4444-8444-444444444444')
        if protocol_version == 1:
            started = self.start(identity=identity, prepared=prepared['prepared'], digest=prepared['preview_digest'])
        else:
            started = self.v2_start(prepared, identity)
        self.assertTrue(started['ok'], started)
        request = {'protocol_version': protocol_version, **started['data']}
        self.queue.pop(0)()
        status = self.service.status(request)['data']
        self.assertTrue(self.service.release(request)['data']['released'])
        return status

    def review(self, value, wording, *, protocol_version=1):
        status = self.run_turn(value, protocol_version=protocol_version)
        self.assertEqual(status['state'], 'succeeded', status)
        result = status['result']
        self.assertIsNone(result['candidate_prompt'])
        self.assertIn(wording, result['assistant_reply'])
        value['turns'].extend([{'role': 'user', 'text': value['user_input']}, {'role': 'assistant', 'text': result['assistant_reply']}])
        return result['assistant_reply']

    def test_scope_correction_is_not_a_final_prompt(self):
        value = self.raw()
        wording = 'Suggest ways to simplify my Nix configuration by removing duplication and organizing modules.'
        self.response.text = json.dumps({'assistant_reply': 'I added module organization.', 'candidate_prompt': wording})
        value.update(user_input='Add module organization.', turns=[
            {'role': 'user', 'text': 'How can I simplify my Nix configuration and remove duplication?'},
            {'role': 'assistant', 'text': 'I can help with that.'},
        ])
        status = self.run_turn(value)
        self.assertEqual(status['state'], 'succeeded', status)
        result = status['result']
        self.assertIsNone(result['candidate_prompt'])
        self.assertIn(wording, result['assistant_reply'])
        self.assertIn('Does this cover what you want?', result['assistant_reply'])
        self.assertIn('Use this prompt', result['assistant_reply'])

    def test_registration_is_lazy_and_limited(self):
        import importlib.util
        import pathlib
        import sys
        root = pathlib.Path(refiner.__file__).parent
        spec = importlib.util.spec_from_file_location('refiner_test_plugin', root / '__init__.py', submodule_search_locations=[str(root)])
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        try:
            spec.loader.exec_module(module)
            class Context:
                llm = SimpleNamespace(complete_structured=lambda **kw: None)
                def __init__(self):
                    self.tasks, self.rpc, self.cleanup = [], {}, []
                def get_config(self, *args):
                    raise AssertionError('configuration read during registration')
                def register_auxiliary_task(self, key, **kwargs):
                    self.tasks.append((key, kwargs))
                def register_rpc(self, name, callback):
                    self.rpc[name] = callback
                def on_unload(self, callback):
                    self.cleanup.append(callback)
            ctx = Context()
            module.register(ctx)
            self.assertEqual([x[0] for x in ctx.tasks], ['prompt_refinement'])
            self.assertNotIn('defaults', ctx.tasks[0][1])
            self.assertNotIn('inherit_from', ctx.tasks[0][1])
            self.assertEqual(set(ctx.rpc), {'describe', 'prepare', 'start', 'status', 'release', 'cancel'})
            self.assertEqual(len(ctx.cleanup), 1)
            ctx.cleanup[0]()
        finally:
            sys.modules.pop(spec.name, None)
            sys.modules.pop(spec.name + '.refiner', None)

    def test_v2_golden_prepare_and_digest(self):
        golden = {'input_revision': 2, 'expected_route': ROUTE, 'prepared': PREPARED, 'execution': {'model_override': None, 'reasoning_effort': None}, 'preview_digest': '8be8824e2a8a13f5808bf27ced818e40a015fd88f52cb980fbc5626c3ec27a8b'}
        result = self.service.prepare({'protocol_version': 2, 'input_revision': golden['input_revision'], 'expected_route': golden['expected_route'], 'input': self.raw(), 'execution': golden['execution']})
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['data']['prepared'], golden['prepared'])
        self.assertEqual(result['data']['execution'], golden['execution'])
        self.assertEqual(result['data']['preview_digest'], golden['preview_digest'])

    def v2_prepare(self, execution, expected=ROUTE, value=None):
        return self.service.prepare({'protocol_version': 2, 'input_revision': 2, 'expected_route': expected, 'input': self.raw() if value is None else value, 'execution': execution})

    def v2_start(self, prepared, identity=IDENTITY):
        return self.service.start({'protocol_version': 2, 'identity': identity, 'expected_route': prepared['expected_route'], 'prepared': prepared['prepared'], 'preview_digest': prepared['preview_digest'], 'execution': prepared['execution']})

    def test_v2_trust_allowlists_and_revocation(self):
        execution = {'model_override': {'provider': 'EXAMPLE', 'model': 'Model-X'}, 'reasoning_effort': None}
        override = execution['model_override']
        self.route = {}
        self.error(self.v2_prepare(execution, override), 'override_denied')
        policy = {'allow_provider_override': True, 'allow_model_override': True, 'allowed_providers': ['example'], 'allowed_models': ['model-x']}
        self.service.read_execution_policy = lambda: policy
        prepared = self.v2_prepare(execution, override)['data']
        policy['allowed_models'] = []
        self.error(self.v2_start(prepared), 'override_denied')
        policy['allowed_models'] = ['*']
        started = self.v2_start(prepared)['data']
        policy['allow_provider_override'] = False
        self.queue.pop()()
        status = self.service.status({'protocol_version': 2, **started})['data']
        self.assertEqual(status['error']['code'], 'override_denied')
        self.assertFalse(self.calls)
        self.assertEqual(refiner.MESSAGES['override_denied'], 'The host does not permit this model override.')

    def test_v2_saved_effort_is_not_an_api_override(self):
        self.route['reasoning_effort'] = 'low'
        execution = {'model_override': None, 'reasoning_effort': None}
        prepared = self.v2_prepare(execution)['data']
        changed = copy.deepcopy(prepared)
        changed['execution']['reasoning_effort'] = 'medium'
        self.error(self.v2_start(changed), 'invalid_params')
        started = self.v2_start(prepared)['data']
        self.queue.pop()()
        self.assertNotIn('reasoning_effort', self.calls[0])
        self.assertNotIn('provider', self.calls[0])
        self.assertNotIn('model', self.calls[0])
        self.assertEqual(self.calls[0]['task'], 'prompt_refinement')
        self.assertEqual(self.route['reasoning_effort'], 'low')
        self.assertEqual(self.service.status({'protocol_version': 2, **started})['data']['state'], 'succeeded')
        self.assertTrue(self.service.release({'protocol_version': 2, **started})['data']['released'])
        prepared = self.v2_prepare({'model_override': None, 'reasoning_effort': None})['data']
        self.v2_start(prepared)
        self.queue.pop()()
        self.assertNotIn('reasoning_effort', self.calls[-1])

    def test_v2_override_exact_kwargs_and_independent_jobs(self):
        self.service.read_execution_policy = lambda: {'allow_provider_override': True, 'allow_model_override': True}
        self.route['reasoning_effort'] = 'high'
        a = {'model_override': {'provider': 'Provider-A', 'model': 'Model-A'}, 'reasoning_effort': None}
        b = {'model_override': {'provider': 'Provider-B', 'model': 'Model-B'}, 'reasoning_effort': None}
        first = self.v2_prepare(a, a['model_override'])['data']
        second = self.v2_prepare(b, b['model_override'])['data']
        self.v2_start(first)
        other = dict(IDENTITY, request_id='55555555-5555-4555-8555-555555555555')
        self.v2_start(second, other)
        first['execution']['model_override']['model'] = 'changed'
        self.queue.pop(0)()
        self.queue.pop(0)()
        self.assertEqual([(c['provider'], c['model'], c['task']) for c in self.calls], [('Provider-A', 'Model-A', 'prompt_refinement'), ('Provider-B', 'Model-B', 'prompt_refinement')])
        self.assertTrue(all('reasoning_effort' not in call for call in self.calls))
        self.assertEqual(self.route['reasoning_effort'], 'high')

    def test_v2_invalid_execution_and_metadata(self):
        defaults = {'model_override': None, 'reasoning_effort': None}
        self.route['reasoning_effort'] = 'LOW'
        description = self.service.describe({'protocol_version': 2})['data']
        self.assertIsNone(description['configured_reasoning_effort'])
        self.assertEqual(description['execution_support'], {'model_override': False, 'reasoning_effort': False})
        self.route['reasoning_effort'] = 'high'
        self.assertEqual(self.service.describe({'protocol_version': 2})['data']['configured_reasoning_effort'], 'high')
        self.error(self.v2_prepare(dict(defaults, reasoning_effort='high')), 'invalid_params')
        for execution in (None, {}, dict(defaults, extra=True), dict(defaults, reasoning_effort='HIGH'), dict(defaults, reasoning_effort=[]), dict(defaults, model_override={'provider': 'p'}), dict(defaults, model_override={'provider': 'p ', 'model': 'm'}), dict(defaults, model_override={'provider': 'p', 'model': 'm', 'extra': 1})):
            with self.subTest(execution=execution):
                self.error(self.v2_prepare(execution), 'invalid_params')
        self.error(self.service.describe({'protocol_version': 2, 'extra': 1}), 'invalid_params')

    def test_v2_image_attestation_is_exact_at_each_stage(self):
        import io
        from PIL import Image
        buffer = io.BytesIO()
        Image.new('RGB', (1, 1)).save(buffer, format='PNG')
        value = self.raw()
        value['files'].append({'id': '77777777-7777-4777-8777-777777777777', 'kind': 'image', 'name': 'x.png', 'mime': 'image/png', 'data_base64': base64.b64encode(buffer.getvalue()).decode()})
        override = {'provider': 'p', 'model': 'm'}
        execution = {'model_override': override, 'reasoning_effort': None}
        self.service.read_execution_policy = lambda: {'allow_provider_override': True, 'allow_model_override': True}
        self.attestation = dict(ROUTE, confirmed=True, compatibility_baseline=refiner.BASELINE)
        self.error(self.v2_prepare(execution, override, value), 'image_not_confirmed')
        self.attestation = dict(override, confirmed=True, compatibility_baseline=refiner.BASELINE)
        prepared = self.v2_prepare(execution, override, value)['data']
        self.attestation = dict(ROUTE, confirmed=True, compatibility_baseline=refiner.BASELINE)
        self.error(self.v2_start(prepared), 'image_not_confirmed')
        self.attestation = dict(override, confirmed=True, compatibility_baseline=refiner.BASELINE)
        started = self.v2_start(prepared)['data']
        self.attestation = {}
        self.queue.pop()()
        self.assertEqual(self.service.status({'protocol_version': 2, **started})['data']['error']['code'], 'image_not_confirmed')
        self.assertFalse(self.calls)

    def test_golden_prepare_and_digest(self):
        result = self.prepare()
        self.assertEqual(result, {"ok": True, "data": {"input_revision": 2, "expected_route": ROUTE, "prepared": PREPARED, "preview_digest": DIGEST, "redacted": False}})
        self.assertEqual(self.calls, [])

    def test_describe_sessionless_and_closed(self):
        result = self.service.describe({"protocol_version": 1})["data"]
        self.assertEqual(result["configured_route"], ROUTE)
        self.assertEqual(result["limits"], refiner.LIMITS)
        self.assertEqual(result["image_eligibility"], "not_confirmed")
        self.error(self.service.describe({"protocol_version": 1}, session_id="session"), "invalid_params")
        for value in (True, 1.0, "1"):
            self.error(self.service.describe({"protocol_version": value}), "invalid_params")
        self.error(self.service.describe({"protocol_version": 1, "other": 2}), "invalid_params")

    def test_call_assembly_and_result(self):
        data = self.start()["data"]
        self.assertEqual(self.service.status(self.request(data))["data"]["state"], "pending")
        self.queue.pop()()
        call = self.calls[0]
        self.assertEqual(set(call), {"instructions", "input", "json_mode", "schema_name", "system_prompt", "task", "temperature", "max_tokens", "timeout", "purpose"})
        instructions, schema = call['instructions'].split('\n\nJSON schema:\n')
        self.assertEqual(instructions, refiner.REQUEST_INSTRUCTION)
        self.assertEqual(json.loads(schema), refiner.REPLY_SCHEMA)
        self.assertEqual(call["system_prompt"], refiner.SYSTEM_INSTRUCTION)
        self.assertEqual((call["task"], call["max_tokens"], call["timeout"], call["purpose"]), ("prompt_refinement", 4096, 90, "prompt-refinement"))
        self.assertEqual(json.loads(call["input"][0]["text"]), {"original_draft": PREPARED["original_draft"], "source_messages": PREPARED["source_messages"], "text_files": PREPARED["files"], "refinement_turns": PREPARED["turns"], "current_user_input": PREPARED["user_input"], "current_candidate": None, "image_manifest": []})
        result = self.service.status(self.request(data))["data"]
        self.assertEqual(result["state"], "succeeded")
        self.assertEqual(result["result"]["usage"]["input_tokens"], 3)
        self.assertEqual(result["result"]["reported_route"], {"provider": "example", "model": "reported"})
        self.assertIsNone(result["error"])
        self.assertEqual(self.service.status(self.request(data))["data"], result)
        self.assertEqual(self.service.release(self.request(data))["data"], {"released": True, "abandoned": False})
        self.error(self.service.status(self.request(data)), "job_not_found")

    def test_german_scope_review_and_natural_approval(self):
        value = self.raw()
        value.update(original_draft='', turns=[], candidate_prompt=None,
                     user_input='Erkläre ./build.sh, ohne etwas auszuführen.')
        reply = self.review(value, GERMAN_WORDING)
        self.assertIn('Umfang: Das Skript erklären, ohne es auszuführen.', reply)
        self.assertIn('Entwurf:\n' + GERMAN_WORDING, reply)
        self.assertIn('Deckt das ab, was du möchtest?', reply)
        self.assertIn('„Diesen Prompt verwenden“', reply)
        value['user_input'] = 'Das passt so, danke!'
        status = self.run_turn(value)
        self.assertEqual(status['state'], 'succeeded', status)
        self.assertEqual(status['result']['candidate_prompt'], GERMAN_WORDING)
        self.assertEqual(status['result']['assistant_reply'], 'Der Prompt ist fertig zum Kopieren.')
        self.assertEqual(len(self.calls), 1)

    def test_other_language_keeps_wording_and_documents_the_acceptance_phrase(self):
        wording = '¿Cómo puedo simplificar mi configuración de Nix sin cambiar su comportamiento?'
        self.response.text = json.dumps(draft('Simplificar Nix sin cambiar su comportamiento.', wording, 'other'))
        value = self.raw()
        value.update(original_draft='', turns=[], source_messages=[], files=[], user_input='Simplifica mi configuración de Nix sin cambiar su comportamiento.')
        reply = self.review(value, wording)
        self.assertIn('Simplificar Nix sin cambiar su comportamiento.', reply)
        self.assertIn('“Use this prompt”', reply)
        value['user_input'] = 'Use this prompt'
        self.assertEqual(self.run_turn(value)['result']['candidate_prompt'], wording)
        self.assertEqual(len(self.calls), 1)

    def test_explicit_approval_returns_the_reviewed_wording_without_a_model_call(self):
        for acceptance in ('Approved', 'I approve this prompt.', 'Ship it!', 'Ready as is.', 'Freigegeben!', 'Ich bin zufrieden.'):
            with self.subTest(acceptance=acceptance):
                value = self.raw()
                value.update(turns=[], user_input='Explain ./build.sh, without running it.')
                self.review(value, GERMAN_WORDING, protocol_version=2)
                calls_before_approval = len(self.calls)
                value['user_input'] = acceptance
                status = self.run_turn(value, protocol_version=2)
                self.assertEqual(status['state'], 'succeeded', status)
                self.assertEqual(status['result']['candidate_prompt'], GERMAN_WORDING)
                self.assertEqual(len(self.calls), calls_before_approval)

    def test_mixed_negative_ambiguous_and_quoted_approval_stay_in_review(self):
        value = self.raw()
        value.update(turns=[], user_input='Explain this script without running it.')
        self.review(value, GERMAN_WORDING)
        for user_input in ('Yes, but also explain its flags.', 'No, don’t use this prompt.', 'Maybe.', 'Yes?', 'Yes…',
                           'Approved, but add examples.', 'Not approved.', 'Ship it?', '“Approved”',
                           '“Use this prompt”', '`Use this prompt`', '> Use this prompt', 'The file says “yes”.',
                           'Use this prompt\nAdd examples.', 'Ja, aber erkläre auch die Optionen.', '„Das passt so, danke!“'):
            with self.subTest(user_input=user_input):
                value['user_input'] = user_input
                before = len(self.calls)
                self.review(value, GERMAN_WORDING)
                self.assertEqual(len(self.calls), before + 1)

    def test_only_the_latest_unchanged_review_in_this_refinement_can_be_accepted(self):
        value = self.raw()
        value.update(turns=[], user_input='Explain ./build.sh, without running it.')
        self.review(value, GERMAN_WORDING)
        old = copy.deepcopy(value)
        wording = GERMAN_WORDING + '\n\nBeschreibe auch die Optionen.'
        self.response.text = json.dumps(draft('Das Skript und seine Optionen erklären.', wording, 'de'))
        value['user_input'] = 'Beschreibe auch die Optionen.'
        self.review(value, wording)
        stale_cases = [
            (old, IDENTITY['refinement_id']),
            (value, '55555555-5555-4555-8555-555555555555'),
            (dict(value, source_messages=[]), IDENTITY['refinement_id']),
            (dict(value, turns=[*value['turns'], {'role': 'user', 'text': 'Actually, add a glossary.'}]), IDENTITY['refinement_id']),
        ]
        for stale, refinement_id in stale_cases:
            with self.subTest(stale=stale, refinement_id=refinement_id):
                status = self.run_turn(dict(stale, user_input='Yes'), refinement_id)
                self.assertEqual(status['state'], 'succeeded', status)
                self.assertIsNone(status['result']['candidate_prompt'])
                self.assertIn(wording, status['result']['assistant_reply'])

    def test_model_must_recover_from_acknowledgement_or_question_only_output(self):
        value = self.raw()
        value.update(turns=[], user_input='How can I simplify my Nix configuration?')
        wording = 'Review my Nix configuration and suggest ways to simplify it without changing behavior.'
        for bad in ('Which Nix setup are you using? What version?', 'Okay, I can do that.'):
            with self.subTest(bad=bad):
                outputs = iter([{'assistant_reply': bad, 'candidate_prompt': None}, draft('Ways to simplify Nix.', wording)])
                calls = []
                def model(**kwargs):
                    calls.append(kwargs)
                    self.now += 5
                    return SimpleNamespace(text=json.dumps(next(outputs)), usage=SimpleNamespace(output_tokens=30))
                self.service.model_complete = model
                reply = self.review(value, wording)
                self.assertNotIn(bad, reply)
                self.assertIn('Does this cover what you want?', reply)
                self.assertEqual(len(calls), 2)
                self.assertEqual(calls[1]['timeout'], 85)
                self.assertEqual(calls[1]['max_tokens'], 4066)
                value['user_input'] = 'Add module organization.'

    def test_dialogue_through_host_facade(self):
        try:
            import agent.plugin_llm as facade
        except ModuleNotFoundError as exc:
            if exc.name not in ('agent', 'agent.plugin_llm'):
                raise
            self.skipTest('Hermes host facade is not on this Python path')
        from unittest.mock import patch
        calls = []
        initial = 'Review my Nix configuration and suggest ways to simplify it without changing behavior.'
        duplication = initial + ' Focus on removing duplicated settings.'
        modules = duplication + '\n\nAlso suggest how to organize modules. Do not edit any files.'
        outputs = iter([
            {'assistant_reply': 'Is this NixOS or Home Manager?', 'candidate_prompt': None},
            draft('Simplify the Nix configuration.', initial),
            draft('Simplify Nix and remove duplication.', duplication),
            {'assistant_reply': 'I added module organization.', 'candidate_prompt': modules},
        ])
        def invoke(**kwargs):
            calls.append(kwargs)
            message = SimpleNamespace(content=json.dumps(next(outputs)))
            return 'fixture-provider', 'fixture-model', SimpleNamespace(choices=[SimpleNamespace(message=message)])
        policy = facade._TrustPolicy(plugin_id='prompt-refiner')
        host = facade.make_plugin_llm_for_test(plugin_id='prompt-refiner', policy=policy, sync_caller=invoke)
        self.service.model_complete = host.complete_structured
        value = self.raw()
        value.update(original_draft='', turns=[], candidate_prompt=None)
        with patch.object(facade, '_resolve_task_ownership', return_value=(frozenset(['prompt_refinement']), frozenset())):
            reviewed = [('How can I simplify my Nix configuration?', initial),
                        ('Focus on removing duplication.', duplication), ('Add module organization.', modules)]
            for user_input, wording in reviewed:
                value['user_input'] = user_input
                previous_turns = copy.deepcopy(value['turns'])
                reply = self.review(value, wording, protocol_version=2)
                self.assertIn('Scope:', reply)
                self.assertIn('Draft prompt:\n' + wording, reply)
                self.assertIn('Does this cover what you want?', reply)
                self.assertIn('“Use this prompt” or tell me what to change.', reply)
                self.assertNotIn('I added module organization.', reply)
                self.assertNotIn('Is this NixOS or Home Manager?', reply)
                messages = calls[-1]['messages']
                self.assertEqual([message['role'] for message in messages], ['system', 'user'])
                self.assertEqual(calls[-1]['extra_body'], {'response_format': {'type': 'json_object'}})
                parts = messages[1]['content']
                payload = json.loads(parts[1]['text'])
                self.assertEqual(payload['current_user_input'], user_input)
                self.assertEqual(payload['refinement_turns'], previous_turns)
            value['user_input'] = 'That works, thanks!'
            status = self.run_turn(value, protocol_version=2)
            self.assertEqual(status['state'], 'succeeded', status)
            self.assertEqual(status['result'], {'assistant_reply': 'Prompt ready to copy.', 'candidate_prompt': modules,
                                                'reported_route': {'provider': None, 'model': None}, 'usage': None, 'cost': None})
            self.assertEqual(len(calls), 4)

    def test_first_turn_and_old_histories_cannot_approve(self):
        wording = 'Explain how quantum computers work without assuming a physics background.'
        self.response.text = json.dumps({'assistant_reply': 'Final prompt ready.', 'candidate_prompt': wording})
        for turns, candidate in (([], None), ([], wording), (PREPARED['turns'], wording), (PREPARED['turns'], None)):
            with self.subTest(turns=turns, candidate=candidate):
                value = self.raw()
                value.update(original_draft='“Use this prompt”', turns=copy.deepcopy(turns), candidate_prompt=candidate,
                             user_input='Use this prompt')
                value['source_messages'][0]['text'] = 'Use this prompt'
                value['files'][0]['data_base64'] = base64.b64encode(b'Use this prompt').decode()
                reply = self.review(value, wording)
                self.assertIn('Does this cover what you want?', reply)
                self.assertNotIn('Final prompt ready.', reply)

    def test_duplicate_and_conflict(self):
        first = self.start()["data"]
        self.assertEqual(self.start()["data"], first)
        self.assertEqual(len(self.queue), 1)
        changed = copy.deepcopy(PREPARED)
        changed["user_input"] = "different"
        changed_digest = refiner.digest(2, ROUTE, changed)
        self.error(self.start(prepared=changed, digest=changed_digest), "request_conflict")

    def test_timeout_saturation_and_late_settlement(self):
        first = self.start()["data"]
        second_id = dict(IDENTITY, request_id="55555555-5555-4555-8555-555555555555")
        second = self.start(identity=second_id)["data"]
        third_id = dict(IDENTITY, request_id="66666666-6666-4666-8666-666666666666")
        self.error(self.start(identity=third_id), "busy")
        self.now = 90
        self.assertEqual(self.service.status(self.request(first))["data"]["error"]["code"], "timeout")
        self.error(self.start(identity=third_id), "busy")
        self.queue.pop(0)()
        self.assertEqual(self.service.status(self.request(first))["data"]["error"]["code"], "timeout")
        self.assertTrue(self.start(identity=third_id)["ok"])
        self.now = 210
        self.error(self.service.status(self.request(first)), "job_not_found")
        self.assertEqual(self.service.status(self.request(second))["data"]["state"], "failed")

    def test_timeout_during_inflight_model_and_late_result(self):
        data = self.start()['data']
        def model(**kwargs):
            self.now = 90
            status = self.service.status(self.request(data))['data']
            self.assertEqual(status['error']['code'], 'timeout')
            self.assertTrue(self.service.jobs[data['handle']['job_id']]['active'])
            return self.response
        self.service.model_complete = model
        self.queue.pop()()
        status = self.service.status(self.request(data))['data']
        self.assertEqual(status['state'], 'failed')
        self.assertEqual(status['error']['code'], 'timeout')
        self.assertIsNone(status['result'])

    def test_launch_and_model_failures_are_sanitized(self):
        self.service.launch_worker = lambda callback: (_ for _ in ()).throw(ValueError('secret'))
        self.error(self.start(), 'internal_error')
        self.assertEqual(self.service.jobs, {})
        self.service.launch_worker = self.queue.append
        self.service.model_complete = lambda **kw: (_ for _ in ()).throw(ValueError('secret'))
        data = self.start()['data']
        self.queue.pop()()
        status = self.service.status(self.request(data))['data']
        self.assertEqual(status['error'], {'code': 'model_failed', 'message': refiner.MESSAGES['model_failed']})

    def test_cancel_release_and_capability(self):
        data = self.start()["data"]
        wrong = copy.deepcopy(data)
        wrong["handle"]["result_capability"] = "A" * 43
        for method in (self.service.status, self.service.cancel, self.service.release):
            self.error(method(self.request(wrong)), "job_not_found")
        self.assertEqual(self.service.release(self.request(data))["data"], {"released": False, "abandoned": True})
        self.assertTrue(self.service.cancel(self.request(data))["data"]["abandoned"])
        self.queue.pop()()
        state = self.service.status(self.request(data))["data"]
        self.assertEqual((state["state"], state["result"], state["error"]), ("abandoned", None, None))
        self.assertTrue(self.service.release(self.request(data))["data"]["released"])

    def test_unload_suppresses_late(self):
        data = self.start()["data"]
        self.service.unload()
        self.queue.pop()()
        self.error(self.service.status(self.request(data)), "service_unloaded")
        self.assertEqual(self.service.jobs, {})

    def test_redaction_and_second_pass(self):
        self.redact = lambda s: s.replace("Keine", "MASK")
        result = self.prepare()["data"]
        self.assertTrue(result["redacted"])
        self.assertIn("MASK", result["prepared"]["files"][0]["text"])
        self.error(self.start(), "preview_required")
        self.assertEqual(self.queue, [])

    def test_route_checks_before_and_during_worker(self):
        self.route = {"provider": "auto", "model": "m"}
        self.error(self.prepare(), "route_unconfigured")
        self.route = dict(ROUTE, model="changed")
        self.error(self.prepare(), "route_changed")
        self.route = dict(ROUTE)
        data = self.start()["data"]
        self.route = dict(ROUTE, model="changed")
        self.queue.pop()()
        self.assertEqual(self.service.status(self.request(data))["data"]["error"]["code"], "route_changed")
        self.assertFalse(self.calls)

    def test_invalid_model_output(self):
        valid = draft('Explain a script.', 'Explain what ./build.sh does.')
        outputs = [
            '```json\n{}\n```', '{"assistant_reply":"x","assistant_reply":"y","candidate_prompt":null}',
            '{"assistant_reply":"x","candidate_prompt":" "}', '{"assistant_reply":" ","candidate_prompt":null}',
            json.dumps(valid).replace('"language": "en"', '"language": "en", "language": "de"'),
            *(json.dumps(obj) for obj in (
                {'language': 'en', 'scope_summary': 'No wording.'}, dict(valid, candidate_prompt='Premature final.'),
                dict(valid, language=True), dict(valid, language='es'), dict(valid, scope_summary=' \t '),
                dict(valid, scope_summary='First line.\nSecond line.'), dict(valid, scope_summary='ä' * 257),
                dict(valid, task_wording=None), dict(valid, task_wording=42), dict(valid, task_wording=float('nan')),
                dict(valid, task_wording='\0Nix'), dict(valid, task_wording='\ud800'), dict(valid, task_wording=' '),
                dict(valid, task_wording='ä' * 8192), dict(valid, task_wording='x' * 32769),
            )),
        ]
        for output in outputs:
            with self.subTest(output=output):
                self.response.text = output
                state = self.run_turn(self.raw())
                self.assertEqual((state['state'], state['error']['code'], state['result']), ('failed', 'invalid_output', None))

    def test_second_missing_draft_fails_without_a_third_model_call(self):
        self.response.text = json.dumps({'assistant_reply': 'What is your current setup?', 'candidate_prompt': None})
        state = self.run_turn(self.raw())
        self.assertEqual((state['state'], state['error']['code'], state['result']), ('failed', 'invalid_output', None))
        self.assertEqual(len(self.calls), 2)

    def test_refuses_invalid_files_and_text(self):
        for content, code in ((b'%PDF-test', 'unsupported_type'), (b'PK\x03\x04test', 'unsupported_type'), (b'\xff', 'invalid_encoding'), (b'x\x00y', 'unsupported_type')):
            value = self.raw()
            value['files'][0]['data_base64'] = base64.b64encode(content).decode()
            self.error(self.prepare(value), code)
        value = self.raw()
        value['files'][0]['data_base64'] = 'not base64!'
        self.error(self.prepare(value), 'invalid_params')
        value = self.raw()
        value['user_input'] = '\ud800'
        self.error(self.prepare(value), 'invalid_params')

    def test_image_validation_attestation_and_assembly(self):
        import io
        from PIL import Image
        buffer = io.BytesIO()
        Image.new('RGB', (2, 2), 'red').save(buffer, format='PNG')
        raw_bytes = buffer.getvalue()
        value = self.raw()
        value['files'].append({'id': '77777777-7777-4777-8777-777777777777', 'kind': 'image', 'name': 'image.png', 'mime': 'image/png', 'data_base64': base64.b64encode(raw_bytes).decode()})
        self.error(self.prepare(value), 'image_not_confirmed')
        self.attestation = dict(ROUTE, confirmed=True, compatibility_baseline=refiner.BASELINE, extra=True)
        self.error(self.prepare(value), 'image_not_confirmed')
        self.attestation.pop('extra')
        prepared = self.prepare(value)['data']
        started = self.start(prepared=prepared['prepared'], digest=prepared['preview_digest'])['data']
        self.queue.pop()()
        blocks = self.calls[0]['input']
        self.assertEqual(json.loads(blocks[1]['text']), {'image_id': value['files'][1]['id'], 'name': 'image.png', 'mime': 'image/png'})
        self.assertEqual(blocks[2], {'type': 'image', 'mime_type': 'image/png', 'file_name': 'image.png', 'data': raw_bytes})
        self.assertEqual(self.service.status(self.request(started))['data']['state'], 'succeeded')
        value['files'][1]['data_base64'] = base64.b64encode(b'broken').decode()
        self.error(self.prepare(value), 'invalid_image')

    def test_animated_and_oversized_images_are_rejected(self):
        import io
        from PIL import Image
        self.attestation = dict(ROUTE, confirmed=True, compatibility_baseline=refiner.BASELINE)
        value = self.raw()
        frame = Image.new('RGB', (2, 2), 'red')
        other = Image.new('RGB', (2, 2), 'blue')
        buffer = io.BytesIO()
        frame.save(buffer, format='PNG', save_all=True, append_images=[other], duration=100)
        image = {'id': '77777777-7777-4777-8777-777777777777', 'kind': 'image', 'name': 'image.png', 'mime': 'image/png', 'data_base64': base64.b64encode(buffer.getvalue()).decode()}
        value['files'].append(image)
        self.error(self.prepare(value), 'invalid_image')
        buffer = io.BytesIO()
        Image.new('RGB', (2001, 2000)).save(buffer, format='PNG')
        image['data_base64'] = base64.b64encode(buffer.getvalue()).decode()
        self.error(self.prepare(value), 'image_too_large')

    def test_failures_and_retained_capacity(self):
        self.redact = lambda s: (_ for _ in ()).throw(ValueError('secret'))
        self.error(self.prepare(), 'unsafe_input')
        self.redact = lambda s: s
        for index in range(8):
            ident = dict(IDENTITY, request_id=f'{index:08x}-5555-4555-8555-555555555555')
            result = self.start(identity=ident)
            self.assertTrue(result['ok'])
            self.queue.pop()()
        another = dict(IDENTITY, request_id='99999999-5555-4555-8555-555555555555')
        self.error(self.start(identity=another), 'busy')
        self.now = 120
        self.assertTrue(self.start(identity=another)['ok'])

    def test_limits_and_invalid_revision(self):
        value = self.raw()
        value['user_input'] = 'x' * 16385
        self.error(self.prepare(value), 'too_large')
        value = self.raw()
        value['source_messages'][0]['sequence'] = True
        self.error(self.prepare(value), 'invalid_params')
        self.error(self.start(digest='a' * 64), 'preview_required')

    def test_closed_wire_scalar_and_collection_boundaries(self):
        mutations = [
            (lambda v: v.update(user_input=''), 'invalid_params'),
            (lambda v: v.update(user_input='x' * 16385), 'too_large'),
            (lambda v: v.update(candidate_prompt='x' * 32769), 'too_large'),
            (lambda v: v.update(original_draft='x\0'), 'invalid_params'),
            (lambda v: v.update(extra=1), 'invalid_params'),
            (lambda v: v.update(turns={}), 'invalid_params'),
            (lambda v: v.update(turns=[{'role': 'user', 'text': ''}] * 65), 'too_large'),
            (lambda v: v.update(source_messages=v['source_messages'] * 41), 'too_large'),
            (lambda v: v.update(files=v['files'] * 9), 'too_large'),
            (lambda v: v['source_messages'][0].update(id='11111111-1111-1111-8111-111111111111'), 'invalid_params'),
            (lambda v: v['source_messages'][0].update(id='11111111-1111-4111-8111-11111111111A'), 'invalid_params'),
            (lambda v: v['source_messages'][0].update(truncated=1), 'invalid_params'),
            (lambda v: v['source_messages'][0].update(role='system'), 'invalid_params'),
            (lambda v: v['source_messages'][0].update(sequence=-1), 'invalid_params'),
            (lambda v: v['source_messages'][0].update(sequence=2147483648), 'invalid_params'),
            (lambda v: v['turns'][0].update(text='x' * 16385), 'too_large'),
            (lambda v: v['turns'][0].update(role='system'), 'invalid_params'),
            (lambda v: v['files'].append(copy.deepcopy(v['files'][0])), 'invalid_params'),
            (lambda v: v['files'][0].update(name='../x.txt'), 'unsupported_type'),
            (lambda v: v['files'][0].update(name='x.pdf'), 'unsupported_type'),
            (lambda v: v['files'][0].update(mime='application/pdf'), 'unsupported_type'),
        ]
        for mutate, code in mutations:
            with self.subTest(mutate=mutate):
                value = self.raw()
                mutate(value)
                self.error(self.prepare(value), code)
        for bad in (float('nan'), float('inf'), {1: 'x'}, '\ud800', '\0'):
            with self.subTest(bad=repr(bad)):
                self.error(self.service.describe({'protocol_version': 1, 'extra': bad}), 'invalid_params')
        self.error(self.service.describe({'protocol_version': 1, 'extra': 'x' * 6291457}), 'too_large')
        value = self.raw()
        value['original_draft'] = 'x' * 120000
        value['user_input'] = 'x' * 12000
        self.error(self.prepare(value), 'too_large')

    def test_all_document_signatures_and_bom(self):
        signatures = [b'  \n%PDF-x', b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08',
                      b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1', b'\x1f\x8b', b'BZh',
                      b'\xfd7zXZ\x00', b'7z\xbc\xaf\x27\x1c', b'Rar!\x1a\x07',
                      b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff', b'RIFFxxxxWEBP',
                      b' ' * 257 + b'ustar', b'a\x7fb']
        for signature in signatures:
            with self.subTest(signature=signature):
                value = self.raw()
                value['files'][0]['data_base64'] = base64.b64encode(signature).decode()
                self.error(self.prepare(value), 'unsupported_type')
        value = self.raw()
        value['files'][0]['data_base64'] = base64.b64encode(b'\xef\xbb\xbfhello').decode()
        self.assertEqual(self.prepare(value)['data']['prepared']['files'][0]['text'], 'hello')
        for encoding in ('YQ', 'YQ==\n', 'data:text/plain;base64,YQ==', 'YQ==='):
            with self.subTest(encoding=encoding):
                value['files'][0]['data_base64'] = encoding
                self.error(self.prepare(value), 'invalid_params')

    def test_static_malformed_and_animated_image_formats(self):
        import io
        from PIL import Image
        self.attestation = dict(ROUTE, confirmed=True, compatibility_baseline=refiner.BASELINE)
        for fmt, ext, mime in [('PNG', 'png', 'image/png'), ('JPEG', 'jpg', 'image/jpeg'), ('WEBP', 'webp', 'image/webp')]:
            with self.subTest(fmt=fmt):
                buffer = io.BytesIO()
                Image.new('RGB', (2, 2), 'red').save(buffer, format=fmt)
                value = self.raw()
                image = {'id': '77777777-7777-4777-8777-777777777777', 'kind': 'image', 'name': 'x.' + ext, 'mime': mime, 'data_base64': base64.b64encode(buffer.getvalue()).decode()}
                value['files'].append(image)
                self.assertTrue(self.prepare(value)['ok'])
                image['data_base64'] = base64.b64encode(buffer.getvalue()[:12]).decode()
                self.error(self.prepare(value), 'invalid_image')
        buffer = io.BytesIO()
        Image.new('RGB', (2, 2), 'red').save(buffer, format='WEBP', save_all=True, append_images=[Image.new('RGB', (2, 2), 'blue')], duration=100)
        value = self.raw()
        image = {'id': '77777777-7777-4777-8777-777777777777', 'kind': 'image', 'name': 'x.webp', 'mime': 'image/webp', 'data_base64': base64.b64encode(buffer.getvalue()).decode()}
        value['files'].append(image)
        self.error(self.prepare(value), 'invalid_image')

    def test_actual_rpc_budget_and_image_count(self):
        oversized = {'protocol_version': 1, 'extra': ['x' * 1100000] * 6}
        self.error(self.service.describe(oversized), 'too_large')
        import io
        from PIL import Image
        buffer = io.BytesIO()
        Image.new('RGB', (1, 1)).save(buffer, format='PNG')
        image = {'id': '', 'kind': 'image', 'name': 'x.png', 'mime': 'image/png', 'data_base64': base64.b64encode(buffer.getvalue()).decode()}
        value = self.raw()
        for n in range(4):
            item = dict(image, id=f'{n:08x}-7777-4777-8777-777777777777')
            value['files'].append(item)
        self.attestation = dict(ROUTE, confirmed=True, compatibility_baseline=refiner.BASELINE)
        self.error(self.prepare(value), 'too_large')
        value['files'].pop()
        self.assertTrue(self.prepare(value)['ok'])

    def test_attestation_shapes_and_labels(self):
        valid = dict(ROUTE, confirmed=True, compatibility_baseline=refiner.BASELINE)
        for setting in ({}, None, [], dict(valid, confirmed=1), dict(valid, confirmed=False), dict(valid, compatibility_baseline='other'), dict(valid, provider='other'), dict(valid, model=1), dict(valid, extra=True)):
            with self.subTest(setting=setting):
                self.attestation = setting
                self.assertEqual(self.service.describe({'protocol_version': 1})['data']['image_eligibility'], 'not_confirmed')
        self.attestation = valid
        self.assertEqual(self.service.describe({'protocol_version': 1})['data']['image_eligibility'], 'operator_confirmed')

    def test_all_job_methods_reject_wrong_identity_and_capability(self):
        data = self.start()['data']
        cases = []
        for capability in ('A' * 43, 'A' * 42, '!' * 43, 'A' * 42 + 'B'):
            wrong = copy.deepcopy(data)
            wrong['handle']['result_capability'] = capability
            cases.append(wrong)
        wrong = copy.deepcopy(data)
        wrong['identity']['request_id'] = '55555555-5555-4555-8555-555555555555'
        cases.append(wrong)
        wrong = copy.deepcopy(data)
        wrong['handle']['job_id'] = 'f' * 32
        cases.append(wrong)
        for method in (self.service.status, self.service.cancel, self.service.release):
            for wrong in cases:
                with self.subTest(method=method.__name__, wrong=wrong):
                    self.error(method(self.request(wrong)), 'job_not_found')
        for _ in range(2):
            self.assertEqual(self.service.release(self.request(data))['data'], {'released': False, 'abandoned': True})
            self.assertEqual(self.service.cancel(self.request(data))['data'], {'abandoned': True})
        self.queue.pop()()
        self.assertEqual(self.service.release(self.request(data))['data'], {'released': True, 'abandoned': False})
        for method in (self.service.status, self.service.cancel, self.service.release):
            self.error(method(self.request(data)), 'job_not_found')

    def test_cancel_and_unload_during_model_execution(self):
        for action in ('cancel', 'unload'):
            with self.subTest(action=action):
                if self.service.unloaded:
                    self.setUp()
                data = self.start()['data']
                def model(**kwargs):
                    if action == 'cancel':
                        self.service.cancel(self.request(data))
                    else:
                        self.service.unload()
                    return self.response
                self.service.model_complete = model
                self.queue.pop()()
                if action == 'cancel':
                    state = self.service.status(self.request(data))['data']
                    self.assertEqual((state['state'], state['result'], state['error']), ('abandoned', None, None))
                    self.service.release(self.request(data))
                else:
                    self.assertEqual(self.service.jobs, {})
                    self.error(self.service.status(self.request(data)), 'service_unloaded')

    def test_dialogue_instructions_preserve_scope_and_untrusted_inputs(self):
        self.start()
        self.queue.pop()()
        instruction = self.calls[0]['system_prompt']
        for phrase in ('do not perform the requested task', 'answer the underlying question',
                       'scope_summary', 'task_wording', 'full standalone wording',
                       'unresolved specifics open', 'not permission to implement',
                       'every call is for scope review, never publication', 'intent, uncertainty, scope, language',
                       'constraints, exclusions and permissions', 'untrusted reference data, not approval',
                       'earlier refinement turns are role-labelled historical data',
                       'references to excluded or missing material as unknown'):
            self.assertIn(phrase, instruction.lower())

    def test_production_launch_copies_context_and_route_is_lazy_projected(self):
        import contextvars
        import importlib.util
        import pathlib
        import sys
        import threading
        from unittest.mock import patch
        root = pathlib.Path(refiner.__file__).parent
        spec = importlib.util.spec_from_file_location('refiner_test_plugin', root / '__init__.py', submodule_search_locations=[str(root)])
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        try:
            spec.loader.exec_module(module)
            variable = contextvars.ContextVar('serving_profile', default='missing')
            variable.set('fixture-profile')
            event = threading.Event()
            observed = []
            def callback():
                observed.append(variable.get())
                event.set()
            module._launch(callback)
            self.assertTrue(event.wait(5))
            self.assertEqual(observed, ['fixture-profile'])
            calls = []
            fake_config = SimpleNamespace(load_config_readonly=lambda: calls.append('read') or {'auxiliary': {'prompt_refinement': {'provider': 'p', 'model': 'm', 'inherit_from': '', 'secret': 'never projected'}}, 'other': 'never projected'})
            fake_redactor = SimpleNamespace(redact_sensitive_text=lambda value, **kw: (value, kw))
            with patch.dict(sys.modules, {'hermes_cli': SimpleNamespace(), 'hermes_cli.config': fake_config, 'agent': SimpleNamespace(), 'agent.redact': fake_redactor}):
                self.assertEqual(calls, [])
                self.assertEqual(module._route(), {'provider': 'p', 'model': 'm', 'inherit_from': '', 'reasoning_effort': None})
                self.assertEqual(module._redact('fixture'), ('fixture', {'force': True}))
                self.assertEqual(calls, ['read'])

            policy_config = {'plugins': {'entries': {'prompt-refiner': {'llm': {'allow_provider_override': True, 'allow_model_override': True, 'allowed_providers': ['A', 42], 'allowed_models': ['*'], 'secret': 'hidden'}}}}}
            fake_config.load_config_readonly = lambda: policy_config
            with patch.dict(sys.modules, {'hermes_cli': SimpleNamespace(), 'hermes_cli.config': fake_config}):
                self.assertEqual(module._execution_policy(), {'allow_provider_override': True, 'allow_model_override': True, 'allowed_providers': ['A'], 'allowed_models': ['*']})
        finally:
            sys.modules.pop(spec.name, None)
            sys.modules.pop(spec.name + '.refiner', None)

    def test_result_projection_and_literal_request_options(self):
        self.response.agent_id = 'secret-agent'
        self.response.audit = {'secret': 'not returned'}
        self.response.provider = 'auto'
        self.response.model = 'bad\nlabel'
        self.response.usage = SimpleNamespace(input_tokens=True, output_tokens=-1, total_tokens=4, cache_read_tokens=2**53, cache_write_tokens=0)
        data = self.start()['data']
        self.queue.pop()()
        call = self.calls[0]
        schema = json.loads(call['instructions'].split('\n\nJSON schema:\n')[1])
        self.assertFalse(schema['additionalProperties'])
        self.assertEqual(set(schema['properties']), {'language', 'scope_summary', 'task_wording'})
        self.assertEqual(set(schema['required']), set(schema['properties']))
        self.assertEqual((call['json_mode'], call['schema_name'], call['temperature']), (True, 'prompt_refiner_review_v1', None))
        result = self.service.status(self.request(data))['data']['result']
        self.assertIn(GERMAN_WORDING, result['assistant_reply'])
        self.assertEqual({k: v for k, v in result.items() if k != 'assistant_reply'}, {'candidate_prompt': None, 'reported_route': {'provider': None, 'model': None}, 'usage': {'input_tokens': 0, 'output_tokens': 0, 'total_tokens': 4, 'cache_read_tokens': 0, 'cache_write_tokens': 0}, 'cost': None})
        self.assertNotIn('secret', repr(result))


if __name__ == '__main__':
    unittest.main()
