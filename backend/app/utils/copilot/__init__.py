"""
The AltRix Copilot, rebuilt around one rule: compute the answer, let the model
only speak it.

The server this runs on has four CPU cores and no GPU. The model it can afford
(qwen2.5:1.5b) reads a prompt at roughly sixty tokens a second, so every
thousand characters handed to it costs four to seven seconds before the first
word, and it cannot be trusted to count or add up a table it has been given.
The Copilot used to hand it about eighteen thousand characters of the school's
records — the same eighteen thousand for every question — and ask it to find
the answer in there. That is why it was slow, and why it was wrong.

Now a question is routed to the module it is about (there is a source for
every school-scoped table in the database), answered by a single scoped query,
and rendered with exact figures before the model is involved at all. The model
is used only to explain a result that has already been computed, or to handle
a question no record can answer — and in both cases it sees a few hundred
characters, not eighteen thousand.
"""
from app.utils.copilot.engine import copilot_stream  # noqa: F401
