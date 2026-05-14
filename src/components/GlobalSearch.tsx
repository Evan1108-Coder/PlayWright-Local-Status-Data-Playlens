import type { UISearchResult } from "../state/appState";

interface GlobalSearchProps {
  query: string;
  results: UISearchResult[];
  onOpenResult: (result: UISearchResult) => void;
}

export function GlobalSearch({ query, results, onOpenResult }: GlobalSearchProps) {
  return (
    <section className="global-search" aria-label="Search results">
      <div className="search-summary">
        <strong>Search results</strong>
        <span>{results.length} for "{query}"</span>
      </div>
      <div className="search-results">
        {results.length === 0 && <p>No matching PlayLens data yet.</p>}
        {results.map((result) => (
          <button key={result.id} className={`search-result ${result.color}`} onClick={() => onOpenResult(result)}>
            <span>{result.label}</span>
            <small>{result.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
