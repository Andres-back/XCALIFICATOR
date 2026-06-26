"""
Monkey-patch llmai OpenAI client to inject json keyword in messages 
when using JSONSchemaResponse, for Alibaba/Qwen compatibility via Open Code gateway.
"""
from llmai.shared import JSONSchemaResponse, SystemMessage

try:
    from llmai.openai.client import OpenAIClient

    _orig_generate = OpenAIClient.generate

    def _patched_generate(self, *, model, messages, temperature=None, tools=None,
                           tool_choice=None, response_format=None, max_tokens=None,
                           reasoning_effort=None, extra_body=None, stream=False):
        if response_format is not None and messages:
            def _msg_text(m):
                if isinstance(m.content, str):
                    return m.content
                if isinstance(m.content, list):
                    return " ".join(
                        p.get("text", "") for p in m.content
                        if isinstance(p, dict)
                    )
                return ""
            all_text = " ".join(_msg_text(m) for m in messages).lower()
            if "json" not in all_text:
                messages = list(messages)
                if messages and isinstance(messages[0], SystemMessage):
                    messages[0] = SystemMessage(
                        content=messages[0].content + " Output must be valid json."
                    )
                else:
                    messages = [SystemMessage(content="Output must be valid json.")] + messages

        return _orig_generate(
            self, model=model, messages=messages, temperature=temperature,
            tools=tools, tool_choice=tool_choice, response_format=response_format,
            max_tokens=max_tokens, reasoning_effort=reasoning_effort,
            extra_body=extra_body, stream=stream,
        )

    OpenAIClient.generate = _patched_generate
    print("llmai_patch: OpenAIClient.generate patched OK")
except Exception as e:
    print(f"llmai_patch: WARNING - could not patch: {e}")
