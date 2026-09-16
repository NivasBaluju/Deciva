import os
import re
from typing import List, Dict, Any, Tuple
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

try:
    from backend.services.database import get_db_connection
except ImportError:
    from services.database import get_db_connection

DEFAULT_TOP_K = int(os.getenv("RAG_TOP_K", 5))
DEFAULT_MIN_SIMILARITY = float(os.getenv("RAG_MIN_SIMILARITY", 0.08))

def retrieve_relevant_segments(
    document_id: str,
    query: str,
    top_k: int = None,
    min_similarity: float = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Retrieves the most relevant document segments from PostgreSQL for a given query
    using TF-IDF vectorization and Cosine Similarity.
    
    Guarantees strict multi-tenant isolation: WHERE document_id = %s.
    
    Returns:
      (sources: list of matched segment dicts, retrieval_meta: dict)
    """
    if top_k is None:
        top_k = DEFAULT_TOP_K
    if min_similarity is None:
        min_similarity = DEFAULT_MIN_SIMILARITY

    query = (query or "").strip()
    if not query:
        return [], {"topScore": 0.0, "grounded": False, "count": 0}

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, document_id, title, segment_text, position
            FROM document_segments
            WHERE document_id = %s
            ORDER BY position ASC;
        """, (document_id,))
        rows = cur.fetchall()

        # If no segments exist yet, check if extracted_text is in documents
        if not rows:
            cur.execute("SELECT extracted_text FROM documents WHERE id = %s;", (document_id,))
            doc_row = cur.fetchone()
            if doc_row and doc_row.get("extracted_text"):
                raw_text = doc_row["extracted_text"]
                paragraphs = [p.strip() for p in re.split(r'[\r\n]+', raw_text) if len(p.strip()) > 10]
                rows = [
                    {
                        "id": f"fallback-seg-{idx}",
                        "document_id": document_id,
                        "title": f"Clause {idx + 1}",
                        "segment_text": p,
                        "position": idx
                    }
                    for idx, p in enumerate(paragraphs)
                ]

        if not rows:
            return [], {"topScore": 0.0, "grounded": False, "count": 0}

        segment_texts = [r["segment_text"] for r in rows]

        if not SKLEARN_AVAILABLE:
            q_tokens = set(re.findall(r'\w+', (query or '').lower()))
            scored = []
            for r in rows:
                seg_tokens = set(re.findall(r'\w+', (r.get("segment_text") or '').lower()))
                overlap = len(q_tokens & seg_tokens) / max(1, len(q_tokens))
                if overlap >= 0.1:
                    scored.append((overlap, r))
            scored.sort(key=lambda x: x[0], reverse=True)
            top = scored[:top_k]
            return [t[1] for t in top], {"topScore": round(top[0][0], 2) if top else 0.0, "grounded": bool(top), "count": len(top)}

        vectorizer = TfidfVectorizer(
            stop_words='english',
            ngram_range=(1, 2),
            sublinear_tf=True
        )

        try:
            tfidf_matrix = vectorizer.fit_transform(segment_texts)
            query_vec = vectorizer.transform([query])
            similarities = cosine_similarity(query_vec, tfidf_matrix)[0]
        except ValueError:
            # Vocabulary empty (e.g. only stop words or numbers)
            return [], {"topScore": 0.0, "grounded": False, "count": 0}

        scored_segments = []
        for idx, score in enumerate(similarities):
            if score >= min_similarity:
                row = rows[idx]
                scored_segments.append({
                    "segmentId": str(row["id"]),
                    "segmentIndex": int(row["position"]),
                    "section": row["title"] or f"Section {row['position'] + 1}",
                    "excerpt": row["segment_text"][:300] + ("..." if len(row["segment_text"]) > 300 else ""),
                    "fullText": row["segment_text"],
                    "similarity": round(float(score), 4)
                })

        # Sort descending by similarity score
        scored_segments.sort(key=lambda s: s["similarity"], reverse=True)
        top_sources = scored_segments[:top_k]

        # Assign rank 1..K
        for rank_idx, item in enumerate(top_sources):
            item["rank"] = rank_idx + 1

        top_score = top_sources[0]["similarity"] if top_sources else 0.0
        grounded = len(top_sources) > 0 and top_score >= min_similarity

        meta = {
            "topScore": top_score,
            "grounded": grounded,
            "count": len(top_sources),
            "threshold": min_similarity
        }

        return top_sources, meta

    finally:
        cur.close()
        conn.close()
