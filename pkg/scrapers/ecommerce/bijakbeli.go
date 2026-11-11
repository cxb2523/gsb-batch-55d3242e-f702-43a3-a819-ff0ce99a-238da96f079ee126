package ecommerce

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/nichsedge/indoscraping/pkg/core"
)

// StapleItem represents a consumer staple price observation for Bijak-Beli.
type StapleItem struct {
	StapleCategory string `json:"stapleCategory"` // e.g. "minyak", "beras", "susu", "gula", "telur", "mie"
	Source         string `json:"source"`         // "alfagift" or "indomaret"
	ProductName    string `json:"productName"`
	PriceRaw       string `json:"priceRaw"`
	PriceNumeric   int    `json:"priceNumeric"`
	ProductURL     string `json:"productUrl"`
	Seller         string `json:"seller"`
	ScrapedAt      string `json:"scrapedAt"`
}

// BijakBeliSummary provides comparative stats between Alfamart and Indomaret.
type BijakBeliSummary struct {
	Category      string  `json:"category"`
	AlfaMinPrice  int     `json:"alfaMinPrice"`
	AlfaAvgPrice  float64 `json:"alfaAvgPrice"`
	IndoMinPrice  int     `json:"indoMinPrice"`
	IndoAvgPrice  float64 `json:"indoAvgPrice"`
	CheapestStore string  `json:"cheapestStore"`
}

type BijakBeliOptions struct {
	Queries      []string
	LimitPerItem int
	OutputPath   string
}

// stapleFetcher fetches products for a single query from one retailer.
// It is the seam that lets tests substitute offline fakes for the live scrapers.
type stapleFetcher func(query string, limit int) ([]Product, error)

// defaultAlfagiftFetcher adapts the live Alfagift scraper.
func defaultAlfagiftFetcher(query string, limit int) ([]Product, error) {
	return ScrapeAlfagift(AlfagiftOptions{
		Query:         query,
		LimitProducts: limit,
		OutputPath:    filepath.Join("data/ecommerce/alfagift", fmt.Sprintf("staple_%s.json", query)),
	})
}

// defaultIndomaretFetcher adapts the live Klik Indomaret scraper.
func defaultIndomaretFetcher(query string, limit int) ([]Product, error) {
	return ScrapeIndomaret(IndomaretOptions{
		Query:         query,
		LimitProducts: limit,
		OutputPath:    filepath.Join("data/ecommerce/indomaret", fmt.Sprintf("staple_%s.json", query)),
	})
}

// RunBijakBeli executes cross-retailer consumer staple price ingestion
// against the live Alfagift and Klik Indomaret scrapers.
func RunBijakBeli(opts BijakBeliOptions) ([]StapleItem, []BijakBeliSummary, error) {
	return runBijakBeli(opts, defaultAlfagiftFetcher, defaultIndomaretFetcher)
}

// runBijakBeli is the testable core of the price-comparison pipeline.
//
// Resilience contract:
//   - A failing retailer logs a warning and the run continues with the other
//     retailer and the remaining categories; products already collected are
//     never discarded.
//   - Categories with valid prices (price > 0) from only one retailer compute
//     min/avg from that retailer alone and point CheapestStore at it.
//   - Categories with no valid price from either retailer get min/avg of 0 and
//     CheapestStore "equal", and still appear in the summary.
//   - Empty or whitespace-only queries are skipped entirely: no detail rows,
//     no summary rows.
func runBijakBeli(opts BijakBeliOptions, alfaFetch, indoFetch stapleFetcher) ([]StapleItem, []BijakBeliSummary, error) {
	if len(opts.Queries) == 0 {
		opts.Queries = []string{"minyak", "beras", "susu", "gula", "telur", "mie"}
	}
	if opts.LimitPerItem <= 0 {
		opts.LimitPerItem = 3
	}
	if opts.OutputPath == "" {
		opts.OutputPath = "data/bijak_beli/latest.json"
	}

	scrapedAt := time.Now().UTC().Format(time.RFC3339)
	allItems := make([]StapleItem, 0)
	summaries := make([]BijakBeliSummary, 0, len(opts.Queries))

	for _, query := range opts.Queries {
		q := strings.TrimSpace(query)
		if q == "" {
			continue
		}

		// 1. Scrape Alfagift; a failure here must not abort the round.
		alfaProducts, err := alfaFetch(q, opts.LimitPerItem)
		if err != nil {
			fmt.Printf("⚠️  [BijakBeli] Warning: failed to fetch Alfagift for '%s': %v\n", q, err)
		}

		// 2. Scrape Indomaret; likewise isolated from Alfagift's outcome.
		indoProducts, err := indoFetch(q, opts.LimitPerItem)
		if err != nil {
			fmt.Printf("⚠️  [BijakBeli] Warning: failed to fetch Indomaret for '%s': %v\n", q, err)
		}

		var alfaTotal, alfaCount, alfaMin int
		for _, p := range alfaProducts {
			allItems = append(allItems, StapleItem{
				StapleCategory: q,
				Source:         "alfagift",
				ProductName:    p.ProductName,
				PriceRaw:       p.PriceRaw,
				PriceNumeric:   p.PriceNumeric,
				ProductURL:     p.ProductURL,
				Seller:         p.Seller,
				ScrapedAt:      scrapedAt,
			})
			if p.PriceNumeric > 0 {
				alfaTotal += p.PriceNumeric
				if alfaCount == 0 || p.PriceNumeric < alfaMin {
					alfaMin = p.PriceNumeric
				}
				alfaCount++
			}
		}

		var indoTotal, indoCount, indoMin int
		for _, p := range indoProducts {
			allItems = append(allItems, StapleItem{
				StapleCategory: q,
				Source:         "indomaret",
				ProductName:    p.ProductName,
				PriceRaw:       p.PriceRaw,
				PriceNumeric:   p.PriceNumeric,
				ProductURL:     p.ProductURL,
				Seller:         p.Seller,
				ScrapedAt:      scrapedAt,
			})
			if p.PriceNumeric > 0 {
				indoTotal += p.PriceNumeric
				if indoCount == 0 || p.PriceNumeric < indoMin {
					indoMin = p.PriceNumeric
				}
				indoCount++
			}
		}

		var alfaAvg, indoAvg float64
		if alfaCount > 0 {
			alfaAvg = float64(alfaTotal) / float64(alfaCount)
		}
		if indoCount > 0 {
			indoAvg = float64(indoTotal) / float64(indoCount)
		}

		cheapest := "equal"
		if alfaMin > 0 && indoMin > 0 {
			if alfaMin < indoMin {
				cheapest = "alfamart"
			} else if indoMin < alfaMin {
				cheapest = "indomaret"
			}
		} else if alfaMin > 0 {
			cheapest = "alfamart"
		} else if indoMin > 0 {
			cheapest = "indomaret"
		}

		summaries = append(summaries, BijakBeliSummary{
			Category:      q,
			AlfaMinPrice:  alfaMin,
			AlfaAvgPrice:  alfaAvg,
			IndoMinPrice:  indoMin,
			IndoAvgPrice:  indoAvg,
			CheapestStore: cheapest,
		})
	}

	historyPath := filepath.Join(filepath.Dir(opts.OutputPath), "history", fmt.Sprintf("%s.json", time.Now().Format("2006-01-02")))
	meta := map[string]interface{}{
		"initiative":  "bijak-beli",
		"items_count": len(allItems),
		"categories":  len(summaries),
		"scraped_at":  scrapedAt,
	}

	if err := core.WriteLatestAndHistory(opts.OutputPath, historyPath, allItems, meta); err != nil {
		return allItems, summaries, err
	}

	// Write the summary next to latest.json so both artifacts stay consistent.
	summaryPath := filepath.Join(filepath.Dir(opts.OutputPath), "summary.json")
	if err := core.AtomicWriteJSON(summaryPath, summaries); err != nil {
		return allItems, summaries, fmt.Errorf("failed to write bijak-beli summary: %w", err)
	}

	return allItems, summaries, nil
}
