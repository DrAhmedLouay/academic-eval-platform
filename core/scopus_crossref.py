"""
محرك التحقق واستخراج بيانات بحوث سكوباس وكروس ريف (Scopus & Crossref Engine)
يقوم باستخراج معرفات الـ DOI وأرقام الـ ISBN، والربط مع قواعد بيانات Scopus و Crossref،
مع توفير قاعدة بيانات محلية (Offline Database) للمجلات العلمية المحكمة ومؤشرات CiteScore
واحتساب الدرجة الأكاديمية الدقيقة وفق تعليمات استمارة 21.
"""
import re
import json
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional, List, Tuple

# قاعدة بيانات محلية للمجلات العالمية والمحلية الشائعة ومؤشرات الاستشهاد (CiteScore / Impact Factor)
OFFLINE_JOURNAL_DATABASE: Dict[str, Dict[str, Any]] = {
    # مجلات Elsevier / Scopus شائعة في الهندسة والعلوم
    "construction and building materials": {"citescore": 8.4, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "applied energy": {"citescore": 16.5, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "journal of cleaner production": {"citescore": 18.5, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "case studies in construction materials": {"citescore": 6.8, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "structures": {"citescore": 5.4, "quartile": "Q2", "publisher": "Elsevier", "is_scopus": True},
    "journal of building engineering": {"citescore": 7.9, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "ain shams engineering journal": {"citescore": 8.1, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "alexandria engineering journal": {"citescore": 9.2, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "heliyon": {"citescore": 4.0, "quartile": "Q1", "publisher": "Elsevier", "is_scopus": True},
    "ieee access": {"citescore": 6.7, "quartile": "Q1", "publisher": "IEEE", "is_scopus": True},
    "scientific reports": {"citescore": 7.5, "quartile": "Q1", "publisher": "Nature", "is_scopus": True},
    "plos one": {"citescore": 5.6, "quartile": "Q1", "publisher": "PLOS", "is_scopus": True},
    "sustainability": {"citescore": 6.8, "quartile": "Q1", "publisher": "MDPI", "is_scopus": True},
    "buildings": {"citescore": 4.8, "quartile": "Q1", "publisher": "MDPI", "is_scopus": True},
    "energies": {"citescore": 6.2, "quartile": "Q1", "publisher": "MDPI", "is_scopus": True},
    "applied sciences": {"citescore": 5.3, "quartile": "Q2", "publisher": "MDPI", "is_scopus": True},
    "materials": {"citescore": 5.7, "quartile": "Q2", "publisher": "MDPI", "is_scopus": True},
    "water": {"citescore": 5.5, "quartile": "Q2", "publisher": "MDPI", "is_scopus": True},
    
    # المجلات العراقية المفهرسة في سكوباس
    "iraqi journal of agricultural sciences": {"citescore": 1.4, "quartile": "Q3", "publisher": "University of Baghdad", "is_scopus": True, "is_iraqi": True},
    "iraqi journal of veterinary sciences": {"citescore": 1.6, "quartile": "Q3", "publisher": "University of Mosul", "is_scopus": True, "is_iraqi": True},
    "baghdad science journal": {"citescore": 2.2, "quartile": "Q2", "publisher": "University of Baghdad", "is_scopus": True, "is_iraqi": True},
    "iraqi journal of science": {"citescore": 1.1, "quartile": "Q3", "publisher": "University of Baghdad", "is_scopus": True, "is_iraqi": True},
    "journal of engineering": {"citescore": 0.8, "quartile": "Q4", "publisher": "University of Baghdad", "is_scopus": True, "is_iraqi": True},
    "engineering and technology journal": {"citescore": 1.2, "quartile": "Q3", "publisher": "University of Technology", "is_scopus": True, "is_iraqi": True},
    "association of arab universities journal of basic and applied sciences": {"citescore": 4.5, "quartile": "Q1", "publisher": "University of Bahrain", "is_scopus": True},
    
    # المجلات العراقية المحلية (IASJ)
    "المجلة العراقية لهندسة العمارة والتخطيط": {"citescore": 0.0, "quartile": "Local", "publisher": "الجامعة التكنولوجية", "is_scopus": False, "is_iraqi": True},
    "مجلة الهندسة والتنمية المستدامة": {"citescore": 0.0, "quartile": "Local", "publisher": "الجامعة المستنصرية", "is_scopus": False, "is_iraqi": True},
    "مجلة جامعة بابل للعلوم الهندسية": {"citescore": 0.0, "quartile": "Local", "publisher": "جامعة بابل", "is_scopus": False, "is_iraqi": True},
    "مجلة المخطط والتنمية": {"citescore": 0.0, "quartile": "Local", "publisher": "جامعة بغداد", "is_scopus": False, "is_iraqi": True}
}


def extract_doi(text: str) -> Optional[str]:
    """استخراج معرف الغرض الرقمي (DOI) بدقة عالية من النص"""
    if not text:
        return None
    patterns = [
        r'\b(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)\b',
        r'doi(?:\.org)?/(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)',
        r'https?://(?:dx\.)?doi\.org/(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)'
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            doi = m.group(1).strip()
            doi = re.sub(r'[\.\s,;>\)]+$', '', doi)
            return doi
    return None


def extract_isbn(text: str) -> Optional[str]:
    """استخراج رقم الإيداع الدولي للكتب (ISBN)"""
    if not text:
        return None
    m = re.search(r'\b(?:ISBN(?:-1[03])?:?\s*)?((?:97[89][- ]?)?\d{1,5}[- ]?\d+[- ]?\d+[- ]?[\dX])\b', text, re.IGNORECASE)
    if m:
        isbn = m.group(1).strip().replace(' ', '-')
        if len(isbn.replace('-', '')) in (10, 13):
            return isbn
    return None


def fetch_doi_metadata(doi: str, timeout_sec: int = 3) -> Optional[Dict[str, Any]]:
    """
    استرجاع البيانات الوصفية للبحث من منصة Crossref الدولية
    مع دعم الخروج الآمن عند عدم توفر الإنترنت (Sandbox / Offline)
    """
    if not doi:
        return None
    clean_doi = doi.strip()
    url = f"https://api.crossref.org/works/{urllib.parse.quote(clean_doi)}"
    headers = {
        "User-Agent": "AcademicEvaluationPlatform/2.0 (mailto:academic-eval@iraq-he.edu)"
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout_sec) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                message = data.get("message", {})
                title = (message.get("title") or [""])[0]
                container = (message.get("container-title") or [""])[0]
                authors = []
                for a in message.get("author", []):
                    name = f"{a.get('given', '')} {a.get('family', '')}".strip()
                    if name:
                        authors.append(name)
                
                created = message.get("created", {}).get("date-parts", [[""]])[0]
                year = str(created[0]) if created and created[0] else ""
                
                return {
                    "doi": clean_doi,
                    "title": title,
                    "journal": container,
                    "authors": authors,
                    "year": year,
                    "publisher": message.get("publisher", ""),
                    "source": "crossref_online"
                }
    except Exception:
        pass
    return None


def match_offline_journal(journal_name: str) -> Optional[Dict[str, Any]]:
    """البحث في قاعدة البيانات المحلية للمجلات المعتمدة ومؤشرات سكوباس"""
    if not journal_name:
        return None
    norm_name = journal_name.strip().lower()
    norm_name = re.sub(r'^(the|journal of|international journal of)\s+', '', norm_name)
    
    for k, v in OFFLINE_JOURNAL_DATABASE.items():
        k_norm = re.sub(r'^(the|journal of|international journal of)\s+', '', k)
        if k_norm in norm_name or norm_name in k_norm:
            res = dict(v)
            res["matched_key"] = k
            return res
    return None


def calculate_paper_score_and_role(
    text: str,
    faculty_name: str = "",
    citescore: float = 0.0,
    is_scopus: bool = True,
    is_iraqi_in_scopus: bool = False
) -> Dict[str, Any]:
    """
    احتساب الدور والدرجة المستحقة للبحث العلمي وفق تعليمات استمارة 21:
    1. مجلات سكوباس / كلاريفيت بـ CiteScore >= 1.0 (أو مجلة عراقية في سكوباس):
       - الباحث الأول أو الباحث المراسل: 60 درجة.
       - باحث مشارك: 35 درجة.
    2. مجلات سكوباس / كلاريفيت بـ CiteScore < 1.0 (غير العراقية):
       - الباحث الأول أو المراسل: 40 درجة.
       - باحث مشارك: 25 درجة.
    3. البحوث المحلية أو المؤتمرات أو الكتب: 25 درجة.
    """
    norm = text.lower() if text else ""
    
    author_role = "باحث مشارك"
    role_weight = "co_author"
    
    first_author_cues = ["first author", "الباحث الاول", "الباحث الأول", "مؤلف اول", "مؤلف أول"]
    corr_author_cues = ["corresponding author", "الباحث المراسل", "المؤلف المراسل", "الباحث الرئيس", "corresponding"]
    
    if any(c in norm for c in first_author_cues):
        author_role = "الباحث الأول"
        role_weight = "first_author"
    elif any(c in norm for c in corr_author_cues):
        author_role = "الباحث المراسل"
        role_weight = "corresponding"
    elif faculty_name:
        m_auth = re.search(r'authors?[:\-]?\s*([^\n\r]+)', text, re.IGNORECASE)
        if m_auth:
            first_entry = m_auth.group(1).split(',')[0].strip()
            first_parts = faculty_name.strip().split()
            if any(p.lower() in first_entry.lower() for p in first_parts if len(p) > 2):
                author_role = "الباحث الأول"
                role_weight = "first_author"
    
    if is_scopus:
        if citescore >= 1.0 or is_iraqi_in_scopus:
            score = 60.0 if role_weight in ("first_author", "corresponding") else 35.0
            rule_desc = f"بحث سكوباس (CiteScore: {citescore} ≥ 1.0 أو مجلة عراقية بسكوباس) بصفة ({author_role}) -> {score} درجة."
        else:
            score = 40.0 if role_weight in ("first_author", "corresponding") else 25.0
            rule_desc = f"بحث سكوباس (CiteScore: {citescore} < 1.0) بصفة ({author_role}) -> {score} درجة."
        
        return {
            "suggested_axis": "axis2",
            "suggested_paragraph": "1",
            "suggested_score": score,
            "author_role": author_role,
            "citescore": citescore,
            "rule_description": rule_desc,
            "is_scopus": True
        }
    else:
        return {
            "suggested_axis": "axis2",
            "suggested_paragraph": "2",
            "suggested_score": 25.0,
            "author_role": author_role,
            "citescore": 0.0,
            "rule_description": f"بحث محلي / مؤتمر علمي مقوم بصفة ({author_role}) -> 25.0 درجة.",
            "is_scopus": False
        }


# توفير مسمى بديل متوافق (Alias) لدعم استدعاءات query_crossref_api
query_crossref_api = fetch_doi_metadata
