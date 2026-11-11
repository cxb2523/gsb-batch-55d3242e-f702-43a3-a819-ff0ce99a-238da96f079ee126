package ecommerce

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/nichsedge/indoscraping/pkg/core"
)

// fakeFetchers builds offline staple fetchers from a static map of
// query -> products / error, keyed per retailer.
type fakeSite struct {
	products map[string][]Product
	errs     map[string]error
}

func (f fakeSite) fetch(query string, limit int) ([]Product, error) {
	if err, ok := f.errs[query]; ok {
		return nil, err
	}
	prods := f.products[query]
	if limit > 0 && len(prods) > limit {
		prods = prods[:limit]
	}
	return prods, nil
}

func prod(name string, price int) Product {
	return Product{
		ProductName:  name,
		PriceRaw:     fmt.Sprintf("Rp %s", core.FormatIDR(price)),
		PriceNumeric: price,
		Seller:       "Test Seller",
		ProductURL:   "https://example.test/p/" + name,
	}
}

// runOffline executes the pipeline with fake fetchers into a temp dir and
// returns the in-memory results plus the parsed artifacts from disk.
func runOffline(t *testing.T, queries []string, alfa, indo fakeSite) ([]StapleItem, []BijakBeliSummary, []StapleItem, []BijakBeliSummary, map[string]interface{}) {
	t.Helper()

	outPath := filepath.Join(t.TempDir(), "bijak_beli", "latest.json")
	items, summaries, err := runBijakBeli(BijakBeliOptions{
		Queries:      queries,
		LimitPerItem: 10,
		OutputPath:   outPath,
	}, alfa.fetch, indo.fetch)
	if err != nil {
		t.Fatalf("runBijakBeli returned error: %v", err)
	}

	// latest.json detail rows must match what was collected in memory.
	var diskItems []StapleItem
	readJSONFile(t, outPath, &diskItems)
	if len(diskItems) != len(items) {
		t.Fatalf("latest.json has %d items, want %d", len(diskItems), len(items))
	}

	// summary.json rows must match the in-memory summaries.
	var diskSummaries []BijakBeliSummary
	readJSONFile(t, filepath.Join(filepath.Dir(outPath), "summary.json"), &diskSummaries)
	if len(diskSummaries) != len(summaries) {
		t.Fatalf("summary.json has %d rows, want %d", len(diskSummaries), len(summaries))
	}

	// meta sidecar must agree with both.
	var meta map[string]interface{}
	readJSONFile(t, core.MetaSidecarPath(outPath), &meta)
	if got := int(meta["items_count"].(float64)); got != len(items) {
		t.Fatalf("meta items_count=%d, want %d", got, len(items))
	}
	if got := int(meta["categories"].(float64)); got != len(summaries) {
		t.Fatalf("meta categories=%d, want %d", got, len(summaries))
	}

	// Detail/summary consistency invariants.
	summaryCats := make(map[string]bool)
	for _, s := range summaries {
		summaryCats[s.Category] = true
	}
	for _, it := range items {
		if it.StapleCategory == "" {
			t.Fatalf("item %q has empty StapleCategory", it.ProductName)
		}
		if !summaryCats[it.StapleCategory] {
			t.Fatalf("item %q has StapleCategory %q with no summary row", it.ProductName, it.StapleCategory)
		}
		if it.Source != "alfagift" && it.Source != "indomaret" {
			t.Fatalf("item %q has invalid source %q", it.ProductName, it.Source)
		}
		if got := core.ParseNumericPrice(it.PriceRaw); got != it.PriceNumeric {
			t.Fatalf("item %q: PriceRaw %q parses to %d, PriceNumeric is %d", it.ProductName, it.PriceRaw, got, it.PriceNumeric)
		}
	}

	return items, summaries, diskItems, diskSummaries, meta
}

func readJSONFile(t *testing.T, path string, v interface{}) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatalf("failed to parse %s: %v", path, err)
	}
}

func summaryFor(t *testing.T, summaries []BijakBeliSummary, category string) BijakBeliSummary {
	t.Helper()
	for _, s := range summaries {
		if s.Category == category {
			return s
		}
	}
	t.Fatalf("no summary row for category %q", category)
	return BijakBeliSummary{}
}

func TestBijakBeliBothSitesSucceed(t *testing.T) {
	alfa := fakeSite{products: map[string][]Product{
		"beras":  {prod("Beras A 5kg", 65000), prod("Beras B 5kg", 61000)},
		"minyak": {prod("Minyak A 2L", 40000)},
	}}
	indo := fakeSite{products: map[string][]Product{
		"beras":  {prod("Beras C 5kg", 63000)},
		"minyak": {prod("Minyak B 2L", 41000), prod("Minyak C 2L", 39000)},
	}}

	items, summaries, _, _, _ := runOffline(t, []string{"beras", "minyak"}, alfa, indo)

	if len(items) != 6 {
		t.Fatalf("got %d items, want 6", len(items))
	}
	if len(summaries) != 2 {
		t.Fatalf("got %d summaries, want 2", len(summaries))
	}

	beras := summaryFor(t, summaries, "beras")
	if beras.AlfaMinPrice != 61000 || beras.IndoMinPrice != 63000 {
		t.Fatalf("beras mins = (%d, %d), want (61000, 63000)", beras.AlfaMinPrice, beras.IndoMinPrice)
	}
	if beras.AlfaAvgPrice != 63000 || beras.IndoAvgPrice != 63000 {
		t.Fatalf("beras avgs = (%v, %v), want (63000, 63000)", beras.AlfaAvgPrice, beras.IndoAvgPrice)
	}
	if beras.CheapestStore != "alfamart" {
		t.Fatalf("beras cheapest = %q, want alfamart", beras.CheapestStore)
	}

	minyak := summaryFor(t, summaries, "minyak")
	if minyak.AlfaMinPrice != 40000 || minyak.IndoMinPrice != 39000 {
		t.Fatalf("minyak mins = (%d, %d), want (40000, 39000)", minyak.AlfaMinPrice, minyak.IndoMinPrice)
	}
	if minyak.IndoAvgPrice != 40000 {
		t.Fatalf("minyak indo avg = %v, want 40000", minyak.IndoAvgPrice)
	}
	if minyak.CheapestStore != "indomaret" {
		t.Fatalf("minyak cheapest = %q, want indomaret", minyak.CheapestStore)
	}

	// Every detail row's StapleCategory must equal its query term.
	for _, it := range items {
		if it.StapleCategory != "beras" && it.StapleCategory != "minyak" {
			t.Fatalf("unexpected StapleCategory %q", it.StapleCategory)
		}
	}
}

func TestBijakBeliSingleSiteFailure(t *testing.T) {
	// Alfagift is down for every query; Indomaret works. The round must
	// complete, keep all Indomaret items, and base stats on Indomaret alone.
	alfa := fakeSite{errs: map[string]error{
		"beras": errors.New("alfagift HTTP 503"),
		"gula":  errors.New("alfagift HTTP 503"),
	}}
	indo := fakeSite{products: map[string][]Product{
		"beras": {prod("Beras C 5kg", 63000), prod("Beras D 5kg", 59000)},
		"gula":  {prod("Gula A 1kg", 18000)},
	}}

	items, summaries, _, _, _ := runOffline(t, []string{"beras", "gula"}, alfa, indo)

	if len(items) != 3 {
		t.Fatalf("got %d items, want 3 (indomaret items must be kept)", len(items))
	}
	for _, it := range items {
		if it.Source != "indomaret" {
			t.Fatalf("unexpected item from source %q", it.Source)
		}
	}

	beras := summaryFor(t, summaries, "beras")
	if beras.AlfaMinPrice != 0 || beras.AlfaAvgPrice != 0 {
		t.Fatalf("beras alfa stats = (%d, %v), want (0, 0)", beras.AlfaMinPrice, beras.AlfaAvgPrice)
	}
	if beras.IndoMinPrice != 59000 || beras.IndoAvgPrice != 61000 {
		t.Fatalf("beras indo stats = (%d, %v), want (59000, 61000)", beras.IndoMinPrice, beras.IndoAvgPrice)
	}
	if beras.CheapestStore != "indomaret" {
		t.Fatalf("beras cheapest = %q, want indomaret", beras.CheapestStore)
	}

	// Mirror case: indomaret fails, alfagift succeeds.
	alfa2 := fakeSite{products: map[string][]Product{
		"telur": {prod("Telur A 1kg", 28000)},
	}}
	indo2 := fakeSite{errs: map[string]error{
		"telur": errors.New("indomaret timeout"),
	}}

	items2, summaries2, _, _, _ := runOffline(t, []string{"telur"}, alfa2, indo2)
	if len(items2) != 1 || items2[0].Source != "alfagift" {
		t.Fatalf("expected 1 alfagift item, got %+v", items2)
	}
	telur := summaryFor(t, summaries2, "telur")
	if telur.AlfaMinPrice != 28000 || telur.IndoMinPrice != 0 || telur.CheapestStore != "alfamart" {
		t.Fatalf("telur summary = %+v, want alfa-only stats with cheapest=alfamart", telur)
	}
}

func TestBijakBeliSingleSiteNoValidPrice(t *testing.T) {
	// Indomaret responds but every price is 0; stats must come from Alfagift only.
	alfa := fakeSite{products: map[string][]Product{
		"susu": {prod("Susu A 1L", 22000), prod("Susu B 1L", 24000)},
	}}
	indo := fakeSite{products: map[string][]Product{
		"susu": {prod("Susu C 1L", 0), prod("Susu D 1L", 0)},
	}}

	items, summaries, _, _, _ := runOffline(t, []string{"susu"}, alfa, indo)

	// Zero-price rows are still collected as detail items.
	if len(items) != 4 {
		t.Fatalf("got %d items, want 4", len(items))
	}

	susu := summaryFor(t, summaries, "susu")
	if susu.AlfaMinPrice != 22000 || susu.AlfaAvgPrice != 23000 {
		t.Fatalf("susu alfa stats = (%d, %v), want (22000, 23000)", susu.AlfaMinPrice, susu.AlfaAvgPrice)
	}
	if susu.IndoMinPrice != 0 || susu.IndoAvgPrice != 0 {
		t.Fatalf("susu indo stats = (%d, %v), want (0, 0)", susu.IndoMinPrice, susu.IndoAvgPrice)
	}
	if susu.CheapestStore != "alfamart" {
		t.Fatalf("susu cheapest = %q, want alfamart", susu.CheapestStore)
	}
}

func TestBijakBeliBothSitesEmpty(t *testing.T) {
	// Neither retailer has a valid price: min/avg 0, cheapest "equal",
	// and the category still appears in the summary.
	alfa := fakeSite{products: map[string][]Product{
		"mie": {prod("Mie A", 0)},
	}}
	indo := fakeSite{products: map[string][]Product{
		"mie": {},
	}}

	items, summaries, _, diskSummaries, _ := runOffline(t, []string{"mie"}, alfa, indo)

	if len(items) != 1 {
		t.Fatalf("got %d items, want 1 (zero-price row is still collected)", len(items))
	}
	if len(summaries) != 1 {
		t.Fatalf("got %d summaries, want 1 — empty category must still be summarized", len(summaries))
	}

	mie := summaryFor(t, summaries, "mie")
	if mie.AlfaMinPrice != 0 || mie.AlfaAvgPrice != 0 || mie.IndoMinPrice != 0 || mie.IndoAvgPrice != 0 {
		t.Fatalf("mie stats = %+v, want all zeros", mie)
	}
	if mie.CheapestStore != "equal" {
		t.Fatalf("mie cheapest = %q, want equal", mie.CheapestStore)
	}
	if diskSummaries[0].Category != "mie" {
		t.Fatalf("summary.json category = %q, want mie", diskSummaries[0].Category)
	}
}

func TestBijakBeliBlankQueriesSkipped(t *testing.T) {
	called := false
	spy := func(query string, limit int) ([]Product, error) {
		called = true
		return nil, nil
	}

	outPath := filepath.Join(t.TempDir(), "bijak_beli", "latest.json")
	items, summaries, err := runBijakBeli(BijakBeliOptions{
		Queries:    []string{"", "   ", "\t\n"},
		OutputPath: outPath,
	}, spy, spy)
	if err != nil {
		t.Fatalf("runBijakBeli returned error: %v", err)
	}

	if called {
		t.Fatal("fetcher must not be called for blank queries")
	}
	if len(items) != 0 {
		t.Fatalf("got %d items, want 0", len(items))
	}
	if len(summaries) != 0 {
		t.Fatalf("got %d summaries, want 0", len(summaries))
	}

	// Artifacts must still be written and internally consistent (empty arrays).
	var diskItems []StapleItem
	readJSONFile(t, outPath, &diskItems)
	if len(diskItems) != 0 {
		t.Fatalf("latest.json has %d items, want 0", len(diskItems))
	}
	var meta map[string]interface{}
	readJSONFile(t, core.MetaSidecarPath(outPath), &meta)
	if got := int(meta["items_count"].(float64)); got != 0 {
		t.Fatalf("meta items_count=%d, want 0", got)
	}
	if got := int(meta["categories"].(float64)); got != 0 {
		t.Fatalf("meta categories=%d, want 0", got)
	}
}

func TestBijakBeliBlankQueriesMixedWithValid(t *testing.T) {
	alfa := fakeSite{products: map[string][]Product{
		"gula": {prod("Gula A 1kg", 17500)},
	}}
	indo := fakeSite{products: map[string][]Product{
		"gula": {prod("Gula B 1kg", 17200)},
	}}

	items, summaries, _, _, _ := runOffline(t, []string{"  ", "gula", ""}, alfa, indo)

	if len(summaries) != 1 || summaries[0].Category != "gula" {
		t.Fatalf("summaries = %+v, want a single gula row", summaries)
	}
	if len(items) != 2 {
		t.Fatalf("got %d items, want 2", len(items))
	}
	gula := summaries[0]
	if gula.CheapestStore != "indomaret" {
		t.Fatalf("gula cheapest = %q, want indomaret", gula.CheapestStore)
	}
}

func TestBijakBeliMinIgnoresZeroPricedFirstProduct(t *testing.T) {
	// Regression: the first product has no valid price; the min must come
	// from the first *valid* price, not stay 0.
	alfa := fakeSite{products: map[string][]Product{
		"beras": {prod("Beras Zero", 0), prod("Beras A 5kg", 65000), prod("Beras B 5kg", 61000)},
	}}
	indo := fakeSite{products: map[string][]Product{
		"beras": {prod("Beras C 5kg", 63000)},
	}}

	_, summaries, _, _, _ := runOffline(t, []string{"beras"}, alfa, indo)

	beras := summaryFor(t, summaries, "beras")
	if beras.AlfaMinPrice != 61000 {
		t.Fatalf("beras alfa min = %d, want 61000 (zero-priced first product must not zero the min)", beras.AlfaMinPrice)
	}
	if beras.AlfaAvgPrice != 63000 {
		t.Fatalf("beras alfa avg = %v, want 63000 (avg over valid prices only)", beras.AlfaAvgPrice)
	}
	if beras.CheapestStore != "alfamart" {
		t.Fatalf("beras cheapest = %q, want alfamart", beras.CheapestStore)
	}
}

func TestBijakBeliSummaryLogic(t *testing.T) {
	// Verify comparison math and structure
	summary := BijakBeliSummary{
		Category:      "minyak",
		AlfaMinPrice:  34000,
		AlfaAvgPrice:  35500.0,
		IndoMinPrice:  33500,
		IndoAvgPrice:  36000.0,
		CheapestStore: "indomaret",
	}

	if summary.Category != "minyak" {
		t.Errorf("Expected category minyak, got %s", summary.Category)
	}
	if summary.CheapestStore != "indomaret" {
		t.Errorf("Expected cheapest indomaret, got %s", summary.CheapestStore)
	}
}

func TestProductSchemaIntegrity(t *testing.T) {
	p := Product{
		ProductName:  "Minyak Goreng Sania 2L",
		PriceRaw:     "Rp 34.000",
		PriceNumeric: 34000,
		Seller:       "Alfamart",
		ProductURL:   "https://alfagift.id/p/123",
		Category:     "minyak",
		ScrapedAt:    "2026-11-11T12:00:00Z",
	}

	if p.PriceNumeric != 34000 {
		t.Errorf("Expected price 34000, got %d", p.PriceNumeric)
	}
	if p.Category != "minyak" {
		t.Errorf("Expected category minyak, got %s", p.Category)
	}
}
