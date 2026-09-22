# -*- coding: utf-8 -*-
"""
The shape report cards are actually stored in.

`report_cards.trend_data` defaults to `'{}'::jsonb` - an empty JSON *object* -
while `ReportCardOut` declares a list. Pydantic refused every row, so
`GET /report-cards/{id}` answered 500 for all seven cards in production and
the Report Cards screen could neither download, print nor share anything.

A missing trend chart must never cost a family its report card, so anything
unusable becomes an empty series rather than an error.
"""
import uuid

import pytest

from app.schemas import ReportCardOut


def card(**overrides):
    base = dict(
        id=uuid.uuid4(),
        school_id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        period_type="exam",
    )
    base.update(overrides)
    return ReportCardOut(**base)


def test_the_stored_default_is_read_as_an_empty_series():
    # This exact value is what every card in production carried.
    assert card(trend_data={}).trend_data == []


def test_a_list_passes_through_untouched():
    series = [{"label": "Term 1", "percentage": 78}]
    assert card(trend_data=series).trend_data == series


def test_a_mapping_of_term_to_percentage_is_read_as_the_series_it_describes():
    assert card(trend_data={"Term 1": 78, "Term 2": 85}).trend_data == [
        {"label": "Term 1", "percentage": 78},
        {"label": "Term 2", "percentage": 85},
    ]


def test_absent_stays_absent():
    assert card().trend_data is None


@pytest.mark.parametrize("junk", ["", 17, True])
def test_something_unusable_becomes_an_empty_series_not_a_500(junk):
    assert card(trend_data=junk).trend_data == []
