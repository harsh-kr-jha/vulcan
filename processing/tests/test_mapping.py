from processing.mapping import (
    Confidence,
    TemplateField,
    header_signature,
    normalize_header,
    suggest_mappings,
)


def test_normalize_header_is_stable():
    assert normalize_header(" Actual-Output (Units) ") == "actual output units"


def test_signature_ignores_sheet_order_and_header_punctuation():
    first = {"Production": ["Actual Output", "Good_Qty"], "Quality": ["Reject Reason"]}
    second = {"Quality": ["Reject Reason"], "Production": ["Actual-Output", "Good Qty"]}
    assert header_signature(first) == header_signature(second)


def test_suggest_mapping_prioritises_aliases():
    fields = [
        TemplateField("actual_quantity", "Actual quantity", "decimal", aliases=("Produced Qty",)),
        TemplateField("good_quantity", "Good quantity", "decimal", aliases=("Accepted Qty",)),
    ]
    suggestions = suggest_mappings(["Produced Qty", "Accepted Qty"], fields)

    assert [suggestion.target_key for suggestion in suggestions] == [
        "actual_quantity",
        "good_quantity",
    ]
    assert all(suggestion.confidence == Confidence.HIGH for suggestion in suggestions)


def test_exact_later_header_is_not_consumed_by_earlier_fuzzy_header():
    fields = [TemplateField("po_number", "Purchase order number", "string", aliases=("PO No",))]

    suggestions = suggest_mappings(["Sr No", "PO NO."], fields)

    assert suggestions[0].target_key is None
    assert suggestions[1].target_key == "po_number"
