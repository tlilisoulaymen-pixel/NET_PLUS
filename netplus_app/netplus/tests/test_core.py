"""
Unit tests for NetPlus core utilities.
Run with: bench run-tests --app netplus
"""

import unittest
import math


class TestGeoUtils(unittest.TestCase):
    """Tests for haversine geofencing."""

    def test_haversine_same_point(self):
        from netplus.utils.geo import haversine_distance
        d = haversine_distance(45.4988, -73.5781, 45.4988, -73.5781)
        self.assertAlmostEqual(d, 0.0, places=1)

    def test_haversine_known_distance(self):
        """Montreal → Quebec City ≈ 233 km."""
        from netplus.utils.geo import haversine_distance
        d = haversine_distance(45.5017, -73.5673, 46.8139, -71.2080)
        # Should be between 230,000m and 240,000m
        self.assertGreater(d, 230_000)
        self.assertLess(d, 240_000)

    def test_within_geofence_inside(self):
        from netplus.utils.geo import is_within_geofence
        inside, dist = is_within_geofence(
            45.4990, -73.5783,   # operator (very close)
            45.4988, -73.5781,   # site
            200, 0               # 200m radius, 0m GPS accuracy
        )
        self.assertTrue(inside)
        self.assertLess(dist, 200)

    def test_within_geofence_outside(self):
        from netplus.utils.geo import is_within_geofence
        inside, dist = is_within_geofence(
            45.5100, -73.5781,   # operator (far away ~1.2km)
            45.4988, -73.5781,   # site
            200, 0
        )
        self.assertFalse(inside)
        self.assertGreater(dist, 200)

    def test_geofence_with_gps_accuracy_compensation(self):
        """GPS accuracy reduces effective distance — operator closer than they appear."""
        from netplus.utils.geo import is_within_geofence
        # Operator at 220m raw, but GPS accuracy is 50m → effective distance = 170m
        inside, dist = is_within_geofence(
            45.5008, -73.5781,  # ~220m away
            45.4988, -73.5781,
            200, 50             # 50m GPS accuracy
        )
        # With 50m accuracy compensation, effective_distance = dist - 50 < 200
        self.assertTrue(inside)


class TestScoringEngine(unittest.TestCase):
    """Tests for scoring calculations."""

    def test_stars_to_quality_score(self):
        from netplus.utils.scoring import stars_to_quality_score
        self.assertAlmostEqual(stars_to_quality_score(5.0), 100.0)
        self.assertAlmostEqual(stars_to_quality_score(1.0), 20.0)
        self.assertAlmostEqual(stars_to_quality_score(3.0), 60.0)

    def test_punctuality_score_values(self):
        from netplus.utils.scoring import punctuality_score_from_status
        self.assertEqual(punctuality_score_from_status("À l'heure"), 100.0)
        self.assertEqual(punctuality_score_from_status("Retard léger"), 70.0)
        self.assertEqual(punctuality_score_from_status("Retard modéré"), 40.0)
        self.assertEqual(punctuality_score_from_status("Retard important"), 10.0)
        self.assertEqual(punctuality_score_from_status("Non présenté"), 0.0)

    def test_compute_global_score_perfect(self):
        from netplus.utils.scoring import compute_global_score
        score = compute_global_score(100.0, 100.0, 100.0)
        self.assertAlmostEqual(score, 100.0)

    def test_compute_global_score_zero(self):
        from netplus.utils.scoring import compute_global_score
        score = compute_global_score(0.0, 0.0, 0.0)
        self.assertAlmostEqual(score, 0.0)

    def test_compute_global_score_weighted(self):
        """Quality=100, Punctuality=0, Completion=100 → should be 80 (50%+0%+20%)/(50+30+20)*100."""
        from netplus.utils.scoring import compute_global_score
        score = compute_global_score(100.0, 0.0, 100.0)
        # quality(50%) + punctuality(0%) + completion(20%) = 70/100 = 70
        self.assertAlmostEqual(score, 70.0, places=1)

    def test_global_score_clamped(self):
        """Score with penalties is clamped to 0."""
        from netplus.utils.scoring import compute_global_score
        score = compute_global_score(0.0, 0.0, 0.0, penalties=50.0)
        self.assertEqual(score, 0.0)

    def test_team_distribution_equal(self):
        from netplus.utils.scoring import distribute_team_feedback
        result = distribute_team_feedback(
            rating=4.0,
            team_operators=["EMP-001", "EMP-002", "EMP-003"],
            lead_employee=None,
            team_mode="equal",
        )
        self.assertEqual(result["EMP-001"], 4.0)
        self.assertEqual(result["EMP-002"], 4.0)
        self.assertEqual(result["EMP-003"], 4.0)

    def test_team_distribution_lead(self):
        from netplus.utils.scoring import distribute_team_feedback
        result = distribute_team_feedback(
            rating=4.0,
            team_operators=["EMP-001", "EMP-002"],
            lead_employee="EMP-001",
            team_mode="lead",
        )
        # Lead gets boosted score, others get reduced
        self.assertGreater(result["EMP-001"], result["EMP-002"])


class TestQRCode(unittest.TestCase):
    """Tests for QR payload encoding/decoding."""

    def test_roundtrip(self):
        from netplus.utils.qr_code import generate_qr_payload, decode_qr_payload
        payload = generate_qr_payload("CNT-2026-00482", 1042, "2026-09-01")
        decoded = decode_qr_payload(payload)
        self.assertEqual(decoded["c"], "CNT-2026-00482")
        self.assertEqual(decoded["cl"], "1042")
        self.assertEqual(decoded["d"], "2026-09-01")

    def test_invalid_token_raises(self):
        from netplus.utils.qr_code import decode_qr_payload
        with self.assertRaises(ValueError):
            decode_qr_payload("this_is_not_valid_base64!!!")


if __name__ == "__main__":
    unittest.main()
