# -*- coding: utf-8 -*-
"""
How much of the database goes into one prompt.

The context builder can assemble a hundred students, fifty invoices, fifty
staff and twenty-five payments into a single prompt. A 1.5B model with a 32k
window cannot hold that plus the question plus the instructions, so the end of
the context — usually where the evidence for the answer was — fell off the
edge, and the Copilot answered vaguely or not at all.

The cut is made on a section boundary and it is declared: half a table is
worse than no table, and a model that was shown less than everything must not
imply otherwise.
"""
from app.routers.misc import AI_CONTEXT_BUDGET_CHARS, trim_ai_context


def section(name: str, rows: int) -> str:
    body = "\n".join(f"- row {i} of {name}" for i in range(rows))
    return f"{name}:\n{body}"


def test_a_short_context_is_left_exactly_as_it_is():
    context = "\n\n".join([section("Students", 3), section("Invoices", 2)])
    assert trim_ai_context(context) == context


def test_an_empty_context_is_not_decorated():
    assert trim_ai_context("") == ""


def test_a_long_context_is_cut_to_the_budget():
    context = "\n\n".join(section(f"Block{i}", 200) for i in range(20))
    trimmed = trim_ai_context(context)
    assert len(trimmed) < len(context)
    assert len(trimmed) <= AI_CONTEXT_BUDGET_CHARS + 200  # plus the notice


def test_the_first_sections_survive_because_they_answer_the_question():
    first = section("Targeted Search Results", 2)
    context = "\n\n".join([first] + [section(f"Block{i}", 300) for i in range(20)])
    trimmed = trim_ai_context(context)
    assert trimmed.startswith("Targeted Search Results")


def test_no_section_is_cut_in_half():
    context = "\n\n".join(section(f"Block{i}", 200) for i in range(20))
    trimmed = trim_ai_context(context)
    for part in trimmed.split("\n\n"):
        if part.startswith("["):
            continue  # the notice
        assert part in context


def test_the_model_is_told_that_something_was_left_out():
    context = "\n\n".join(section(f"Block{i}", 300) for i in range(20))
    trimmed = trim_ai_context(context)
    assert "were left out of this prompt" in trimmed


def test_nothing_is_claimed_when_nothing_was_dropped():
    context = section("Students", 3)
    assert "left out" not in trim_ai_context(context)
