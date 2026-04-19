import os
from litellm import completion
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = os.getenv("NOAH_MODEL", "gpt-4o-mini")

def ask_llm(prompt: str, system: str = "", model: str = None) -> str:
    model = model or DEFAULT_MODEL
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        response = completion(model=model, messages=messages, max_tokens=1000)
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"[LLM error: {e}]"

def summarize_change(file_path: str, diff: str, context: str = "") -> str:
    system = (
        "You are Noah, an AI that silently monitors a developer's codebase. "
        "Your job is to write a single concise sentence (max 20 words) describing "
        "what problem the developer was solving with this change. "
        "Be specific. No preamble. Just the sentence."
    )
    prompt = f"File: {file_path}\n\nDiff:\n{diff[:2000]}"
    if context:
        prompt += f"\n\nRecent context:\n{context}"

    return ask_llm(prompt, system=system)

def answer_question(question: str, memories: list, profile: dict = {}) -> str:
    # Sort by timestamp so recent changes appear first
    sorted_memories = sorted(memories, key=lambda m: m.get('timestamp', ''), reverse=True)

    memory_text = "\n".join([
        f"- [{m['timestamp'][:16]}] {m['file']}: {m['summary']}"
        for m in sorted_memories
    ]) or "No relevant memories found."

    profile_text = ""
    if profile:
        profile_text = f"\nDeveloper profile: {profile}"

    system = (
        "You are Noah, an AI coding companion with deep knowledge of this developer's codebase. "
        "Answer questions using the memory context provided. "
        "Memories are sorted newest first. "
        "For questions about 'last', 'recent', or 'latest' changes, use the most recent memory. "
        "Be concise and specific."
    )
    prompt = (
        f"Question: {question}\n\n"
        f"Relevant memories (newest first):\n{memory_text}"
        f"{profile_text}"
    )

    return ask_llm(prompt, system=system)