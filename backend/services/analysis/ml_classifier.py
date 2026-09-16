import os
from typing import Dict, Any, List, Optional

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# CLASSIFIER_NOTE
# This module provides a lightweight in-memory clause-type classifier that acts as
# a secondary signal in the hybrid clause intelligence engine (see analyzer.py).
# The model is a scikit-learn Pipeline(TfidfVectorizer + LogisticRegression) fitted
# at service startup on 41 hardcoded seed examples spanning 9 legal clause categories.
# It is NOT trained on an external enterprise legal dataset.
# It is NOT a PyTorch, HuggingFace, or embedding-based model.
# It is NOT used as the primary document risk-scoring engine.
# Risk scoring is performed exclusively by the Deterministic Calibrated Risk Engine
# in backend/services/analysis/risk_scoring.py (regex patterns + fixed point values).

# Comprehensive Legal Clause Training Dataset
TRAINING_DATA = [
    # CONFIDENTIALITY
    ("The receiving party agrees to protect all confidential proprietary information and trade secrets from unauthorized disclosure.", "CONFIDENTIALITY"),
    ("Neither party shall disclose the terms of this non-disclosure agreement or any proprietary materials.", "CONFIDENTIALITY"),
    ("Confidential Information includes all technical, business, financial, and operational data disclosed hereunder.", "CONFIDENTIALITY"),
    ("The obligations of confidentiality shall survive for five (5) years following expiration of this Agreement.", "CONFIDENTIALITY"),
    ("Recipient shall hold the Disclosing Party's Confidential Information in strict trust and confidence.", "CONFIDENTIALITY"),
    ("All proprietary documents marked Confidential shall remain the sole property of the Disclosing Party.", "CONFIDENTIALITY"),

    # TERMINATION
    ("Either party may terminate this agreement immediately upon written notice in the event of a material breach.", "TERMINATION"),
    ("Upon termination or expiration of this lease, tenant shall promptly surrender the premises in good condition.", "TERMINATION"),
    ("This contract may be terminated without cause by providing thirty (30) days prior written notice.", "TERMINATION"),
    ("In the event of default, the non-defaulting party may terminate this agreement after a ten-day cure period.", "TERMINATION"),
    ("Termination of this Agreement shall not relieve either party of obligations accrued prior to termination.", "TERMINATION"),
    ("Either party may terminate with 30 days written notice prior to annual renewal.", "TERMINATION"),

    ("Client shall pay all invoices net 30 days from date of receipt via wire transfer or ACH.", "PAYMENT"),
    ("The total compensation and purchase price shall be paid in monthly installments plus applicable taxes.", "PAYMENT"),
    ("Late payments shall accrue interest at the rate of one and one-half percent (1.5%) per month.", "PAYMENT"),
    ("Tenant agrees to pay monthly base rent on or before the first day of each calendar month.", "PAYMENT"),
    ("Vendor shall submit itemized invoices detailing hourly billing rates and approved expenses.", "PAYMENT"),
    ("Client shall remit payment within thirty (30) business days following receipt of correct invoice.", "PAYMENT"),

    ("In no event shall either party be liable for any indirect, incidental, special, or consequential damages.", "LIABILITY"),
    ("The aggregate liability of the provider under this agreement shall not exceed the fees paid in the preceding 12 months.", "LIABILITY"),
    ("Neither party excludes or limits its liability for death, personal injury, fraud, or gross negligence.", "LIABILITY"),
    ("Except for indemnification obligations, total liability of either party is strictly capped at fifty thousand dollars.", "LIABILITY"),
    ("Under no circumstances shall company be liable for lost profits, loss of data, or punitive damages.", "LIABILITY"),

    # INDEMNIFICATION
    ("Vendor shall defend, indemnify, and hold harmless client and its officers against any third-party claims.", "INDEMNIFICATION"),
    ("Each party agrees to indemnify the other against damages arising from infringement of third-party IP rights.", "INDEMNIFICATION"),
    ("The indemnifying party shall have sole control over the defense and settlement of any indemnifiable claim.", "INDEMNIFICATION"),
    ("Customer shall indemnify provider from liabilities resulting from customer's unlawful use of the services.", "INDEMNIFICATION"),

    # GOVERNING_LAW
    ("This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware.", "GOVERNING_LAW"),
    ("The courts located in New York County shall have exclusive jurisdiction over any disputes arising hereunder.", "GOVERNING_LAW"),
    ("This contract is subject to the substantive laws of the Commonwealth of Massachusetts without regard to conflicts of law.", "GOVERNING_LAW"),
    ("The validity, interpretation, and performance of this agreement shall be controlled by California state law.", "GOVERNING_LAW"),

    # DISPUTE_RESOLUTION
    ("Any controversy or claim arising out of this contract shall be settled by binding arbitration administered by the AAA.", "DISPUTE_RESOLUTION"),
    ("Parties agree to first attempt good-faith mediation before commencing any formal legal proceedings.", "DISPUTE_RESOLUTION"),
    ("All arbitration proceedings shall take place in San Francisco, California pursuant to JAMS commercial arbitration rules.", "DISPUTE_RESOLUTION"),

    # INTELLECTUAL_PROPERTY
    ("All intellectual property rights, inventions, and work product developed shall belong exclusively to the Company as work made for hire.", "INTELLECTUAL_PROPERTY"),
    ("Licensor retains all right, title, and interest in and to the software, documentation, and underlying patents.", "INTELLECTUAL_PROPERTY"),
    ("Contractor hereby assigns all copyrights, patents, and trade secret rights to the Client without additional compensation.", "INTELLECTUAL_PROPERTY"),

    # FORCE_MAJEURE
    ("Neither party will be liable for performance delays caused by acts of God, war, pandemic, strike, or government embargo.", "FORCE_MAJEURE"),
    ("A party prevented from performing due to force majeure events must notify the other within five business days.", "FORCE_MAJEURE"),

    # DATA_PRIVACY
    ("Each party shall comply with applicable GDPR, CCPA, and data privacy regulations regarding personal data processing.", "DATA_PRIVACY"),
    ("In the event of a security breach involving PII, vendor shall immediately notify customer within 48 hours.", "DATA_PRIVACY"),
]

class LegalClauseMLClassifier:
    """
    Lightweight In-Memory Clause-Type Classifier (Secondary Signal).

    Uses a scikit-learn Pipeline(TfidfVectorizer + LogisticRegression) fitted at
    application startup on 41 hardcoded seed examples across 9 legal clause
    categories (CONFIDENTIALITY, TERMINATION, PAYMENT, LIABILITY, INDEMNIFICATION,
    GOVERNING_LAW, DISPUTE_RESOLUTION, INTELLECTUAL_PROPERTY, FORCE_MAJEURE,
    DATA_PRIVACY).

    This is a secondary classification signal used alongside the rule-based clause
    detector in the hybrid consensus engine. It is not an externally trained legal
    corpus model. It is not used for deterministic contract risk scoring.
    """
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        if SKLEARN_AVAILABLE:
            self.model = Pipeline([
                ('tfidf', TfidfVectorizer(ngram_range=(1, 2), max_features=4000, sublinear_tf=True)),
                ('clf', LogisticRegression(C=3.0, max_iter=500, class_weight='balanced'))
            ])
            self._train_baseline()
        else:
            self.model = None
            self.classes_ = []

    def _train_baseline(self):
        if not SKLEARN_AVAILABLE or not self.model:
            return
        texts, labels = zip(*TRAINING_DATA)
        self.model.fit(texts, labels)
        self.classes_ = self.model.classes_

    def predict_segment(self, segment_text: str) -> Optional[Dict[str, Any]]:
        """
        Runs ML inference on a text segment.
        Returns predicted label, probability confidence, and top candidate distributions.
        """
        if not SKLEARN_AVAILABLE or not self.model:
            return None

        if not segment_text or len(segment_text.strip()) < 15:
            return None

        probs = self.model.predict_proba([segment_text])[0]
        max_idx = probs.argmax()
        top_label = self.classes_[max_idx]
        top_conf = float(probs[max_idx])

        prob_dict = {
            cls_name: round(float(prob), 4)
            for cls_name, prob in zip(self.classes_, probs)
        }

        return {
            "predictedClauseType": top_label,
            "clauseType": top_label,
            "modelConfidence": round(top_conf, 2),
            "confidence": round(top_conf, 2),
            "probabilities": prob_dict,
            "isConfident": top_conf >= 0.40
        }

# Global singleton
ml_classifier = LegalClauseMLClassifier.get_instance()
