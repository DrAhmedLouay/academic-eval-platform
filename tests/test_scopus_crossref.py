import unittest
from core.scopus_crossref import (
    extract_doi,
    extract_isbn,
    match_offline_journal,
    calculate_paper_score_and_role
)
from fastapi.testclient import TestClient
from app import app

class TestScopusCrossref(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_extract_doi(self):
        text = "This paper is published in IEEE Access. DOI: 10.1109/ACCESS.2024.1234567. All rights reserved."
        doi = extract_doi(text)
        self.assertEqual(doi, "10.1109/ACCESS.2024.1234567")

    def test_extract_isbn(self):
        text = "Book title: Advanced Structural Analysis, ISBN 978-0-387-98200-7, Springer 2024."
        isbn = extract_isbn(text)
        self.assertIsNotNone(isbn)
        self.assertIn("978", isbn)

    def test_lookup_journal_in_offline_db(self):
        match = match_offline_journal("IEEE Access")
        self.assertIsNotNone(match)
        self.assertTrue(match["is_scopus"])
        self.assertGreaterEqual(match["citescore"], 1.0)
        self.assertEqual(match["quartile"], "Q1")

    def test_calculate_paper_score_high_citescore(self):
        # CiteScore >= 1.0 gives 60 for single/first author, 35 for co-author
        res_first = calculate_paper_score_and_role("First Author: Dr. Ahmed Louay", faculty_name="Ahmed Louay", citescore=4.8, is_scopus=True)
        self.assertEqual(res_first["suggested_score"], 60.0)

        res_coauthor = calculate_paper_score_and_role("Co-author paper", faculty_name="Ahmed Louay", citescore=4.8, is_scopus=True)
        self.assertEqual(res_coauthor["suggested_score"], 35.0)

    def test_calculate_paper_score_low_citescore(self):
        # CiteScore < 1.0 gives 40 for first author, 25 for co-author
        res_low = calculate_paper_score_and_role("First Author", citescore=0.6, is_scopus=True)
        self.assertEqual(res_low["suggested_score"], 40.0)

        res_low_co = calculate_paper_score_and_role("Co author", citescore=0.6, is_scopus=True)
        self.assertEqual(res_low_co["suggested_score"], 25.0)

    def test_calculate_paper_score_local(self):
        # Local non-Scopus journal gives 25 points
        res_local = calculate_paper_score_and_role("Iraqi Local Journal", citescore=0.0, is_scopus=False)
        self.assertEqual(res_local["suggested_score"], 25.0)

    def test_api_check_doi(self):
        response = self.client.post("/api/check-doi", json={
            "doi": "10.1109/ACCESS.2024.1234567",
            "journal_title": "First Author IEEE Access",
            "ref_code": "REF-AX2-P1-01"
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("suggested_score"), 60.0)
        self.assertEqual(data.get("scopus_info", {}).get("quartile"), "Q1")

if __name__ == "__main__":
    unittest.main()
