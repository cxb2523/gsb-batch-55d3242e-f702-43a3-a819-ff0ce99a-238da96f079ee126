import unittest

from run import verify


class ContentVerification(unittest.TestCase):
    target = {
        "url": "https://example.test/catalog/item",
        "expected": "<title>Catalog item</title>",
        "expectedPaths": ["/catalog/item"],
    }

    def response(self, url="https://example.test/catalog/item", html=None):
        return {"status": "ok", "solution": {
            "status": 200, "url": url,
            "response": html or "<html><title>Catalog item</title><body>Product details</body></html>",
        }}

    def test_content_at_intended_destination(self):
        self.assertTrue(verify(self.target, 200, self.response()))

    def test_unrelated_destination_with_matching_content(self):
        for url in ["https://example.test/landing", "https://other.test/catalog/item", ""]:
            with self.subTest(url=url):
                self.assertFalse(verify(self.target, 200, self.response(url)))

    def test_documented_redirect(self):
        target = {**self.target, "expectedPaths": ["/catalog/item", "/catalog"]}
        self.assertTrue(verify(target, 200, self.response("https://example.test/catalog")))

    def test_matching_brand_on_a_wall_is_not_success(self):
        html = '<title>Catalog item</title><form id="challenge-form">Checking your browser</form>'
        self.assertFalse(verify(self.target, 200, self.response(html=html)))


if __name__ == "__main__":
    unittest.main()
