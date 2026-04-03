from services.credit_score import score_band


def test_score_band_edges():
    assert score_band(1000) == "A"
    assert score_band(800) == "A"
    assert score_band(649) == "C"
    assert score_band(499) == "D"
