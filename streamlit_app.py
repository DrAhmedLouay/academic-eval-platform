"""
منصة تقييم أداء أعضاء الهيئة التدريسية - استمارة رقم (21)
وزارة التعليم العالي والبحث العلمي - جهاز الإشراف والتقويم العلمي
تطبيق Streamlit السحابي المتكامل المطابق بنسبة 100% للواجهة والتصميم الأصلي
"""

import os
import re
import tempfile
import streamlit as st
import streamlit.components.v1 as components

from core.scoring_engine import calculate_evaluation, number_to_arabic_words
from core.docx_generator import create_form_21_docx
from core.pdf_generator import create_form_21_pdf, create_consolidated_dossier_pdf
from core.scopus_crossref import (
    extract_doi,
    match_offline_journal,
    calculate_paper_score_and_role,
    fetch_doi_metadata,
    query_crossref_api
)

# ==============================================================================
# 1. إعداد الصفحة والتخطيط الشامل
# ==============================================================================
st.set_page_config(
    page_title="منصة تقييم أداء أعضاء الهيئة التدريسية - استمارة 21 (2025-2026)",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# ==============================================================================
# 2. تخصيص CSS لإزالة أي هوامش وضمان مطابقة الواجهة الأصلية 100%
# ==============================================================================
st.markdown("""
<style>
    /* إخفاء عناصر تحكم Streamlit الافتراضية */
    header[data-testid="stHeader"], footer, #MainMenu, [data-testid="stToolbar"] {
        display: none !important;
        visibility: hidden !important;
    }
    .stApp {
        background-color: #f8fafc !important;
    }
    .block-container {
        padding-top: 0rem !important;
        padding-bottom: 0rem !important;
        padding-left: 0rem !important;
        padding-right: 0rem !important;
        max-width: 100vw !important;
        width: 100vw !important;
    }
    div[data-testid="stCustomComponentV1"] {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    div[data-testid="stCustomComponentV1"] iframe {
        width: 100% !important;
        height: 100vh !important;
        min-height: 100vh !important;
        border: none !important;
        display: block !important;
    }
    /* شريط التمرير الجانبي */
    [data-testid="stSidebar"] {
        direction: rtl !important;
        text-align: right !important;
    }
</style>
""", unsafe_allow_html=True)


# ==============================================================================
# 3. تجميع وحقن الواجهة الأصلية بالكامل (HTML + CSS + JS)
# ==============================================================================
@st.cache_data
def get_bundled_html():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # تفضيل مجلد docs إن وجد أو static
    html_path = os.path.join(base_dir, "docs", "index.html")
    if not os.path.exists(html_path):
        html_path = os.path.join(base_dir, "static", "index.html")
        
    css_path = os.path.join(base_dir, "docs", "css", "styles.css")
    if not os.path.exists(css_path):
        css_path = os.path.join(base_dir, "static", "css", "styles.css")
        
    js_path = os.path.join(base_dir, "docs", "js", "app.js")
    if not os.path.exists(js_path):
        js_path = os.path.join(base_dir, "static", "js", "app.js")
    
    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()
    with open(css_path, "r", encoding="utf-8") as f:
        css_content = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js_content = f.read()

    # تضمين الـ CSS مباشرة
    html_content = re.sub(
        r'<link[^>]*styles\.css[^>]*>',
        lambda m: f'<style>\n{css_content}\n</style>',
        html_content
    )

    # تضمين الـ JS مباشرة
    html_content = re.sub(
        r'<script[^>]*app\.js[^>]*></script>',
        lambda m: f'<script>\n{js_content}\n</script>',
        html_content
    )

    # شريط التنبيه السحابي الخاص بـ Streamlit Cloud
    streamlit_banner = """
    <div id="gh-pages-banner" style="background: linear-gradient(90deg, #eff6ff, #f0fdf4); border-bottom: 1px solid #bfdbfe; padding: 10px 20px; font-size: 0.88rem; color: #1e3a8a; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-circle-check" style="color: #16a34a; font-size: 1.1rem;"></i>
            <span><strong>المنصة السحابية المعتمدة (Streamlit Community Cloud):</strong> تعمل الآن بالواجهة والتصميم الأصلي الموحد بنسبة 100% مع التفقيط العربي المباشر واحتساب الدرجات اللحظي ومطابقة استمارة 21.</span>
        </div>
        <div>
            <span style="background: #1e3a8a; color: white; padding: 4px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-cloud"></i> السحابة الرسمية المعتمدة
            </span>
        </div>
    </div>
    """
    html_content = re.sub(r'<div id="gh-pages-banner".*?</div>\s*</div>', streamlit_banner, html_content, flags=re.DOTALL)

    return html_content


# عرض الواجهة الأصلية المتكاملة
components.html(get_bundled_html(), height=1300, scrolling=True)


# ==============================================================================
# 4. دوال البيانات الافتراضية والتجريبية لمحرك التصدير (Python Engine)
# ==============================================================================
def get_sample_form_data():
    return {
        "personal_info": {
            "university": "الجامعة التكنولوجية",
            "college": "كلية هندسة العمارة",
            "department": "قسم هندسة التصميم المعماري",
            "form_no": "2026/0412",
            "form_code": "AGY-2026-ARCH-01",
            "first_name": "أحمد",
            "father_name": "لؤي",
            "grandfather_name": "أحمد",
            "great_grandfather_name": "",
            "last_name": "",
            "mother_name": "فاطمة",
            "mother_father_name": "محمد",
            "mother_grandfather_name": "علي",
            "national_id": "198520349812",
            "registry_no": "142",
            "page_no": "58",
            "issue_year": "2021",
            "issue_month": "05",
            "issue_day": "12",
            "degree": "دكتوراه",
            "order_no_and_date": "ق/452 في 2018/06/10",
            "degree_year": "2018",
            "degree_month": "06",
            "degree_day": "10",
            "granting_country": "العراق",
            "granting_univ": "الجامعة التكنولوجية",
            "granting_college": "كلية هندسة العمارة",
            "granting_dept": "قسم هندسة التصميم المعماري",
            "general_specialty": "هندسة معمارية",
            "specific_specialty": "تصميم معماري وتكنولوجيا البناء",
            "academic_title": "أستاذ مساعد",
            "title_granter": "مجلس الجامعة التكنولوجية",
            "title_year": "2022",
            "title_month": "03",
            "title_day": "15",
            "phone": "07701234567",
            "email": "ahmed.l.ahmed@uotechnology.edu.iq"
        },
        "is_non_teaching": False,
        "axis1": {
            "courses_score": 20.0,
            "classroom_management_score": 20.0,
            "blended_learning_items": [5.0, 5.0, 5.0, 5.0],
            "course_description_items": [4.0, 4.0, 4.0, 4.0, 4.0],
            "job_commitment_items": [4.0, 4.0, 4.0, 4.0, 4.0]
        },
        "axis2": {
            "global_research_score": 60.0,
            "local_research_score": 25.0,
            "supervision_score": 15.0
        },
        "axis3": {
            "committees_score": 30.0,
            "continuous_learning_score": 20.0,
            "thank_you_score": 20.0,
            "field_visits_score": 30.0
        },
        "axis4": {
            "items": {
                "h_index": True,
                "reviewing_papers": True,
                "patents": False,
                "women_empowerment": True,
                "human_rights": False
            }
        },
        "axis5": {
            "penalties": []
        }
    }

def get_sample_attachments():
    return [
        {
            "ref_code": "REF-AX1-P1-01",
            "axis": "axis1",
            "paragraph": "1",
            "axis_name": "المحور الأول: جودة التدريس",
            "paragraph_name": "المقررات الدراسية",
            "title": "أمر تكليف بتدريس مادتي التصميم المعماري وتكنولوجيا البناء",
            "doc_type": "أمر إداري بتكليف تدريسي",
            "doc_number": "ق/452",
            "date": "2025/10/01",
            "issuer": "عمادة كلية هندسة العمارة - الجامعة التكنولوجية",
            "suggested_score": 20.0,
            "filename": "أمر تكليف تدريسي معماري.pdf"
        },
        {
            "ref_code": "REF-AX2-P1-01",
            "axis": "axis2",
            "paragraph": "1",
            "axis_name": "المحور الثاني: النشاط العلمي",
            "paragraph_name": "بحوث المستوعبات العالمية (Scopus/Clarivate)",
            "title": "Sustainable Self-Compacting Geopolymer Concrete (CiteScore 6.2 - First Author)",
            "doc_type": "بحث علمي منشور بمستوعب سكوباس",
            "doc_number": "10.1016/j.conbuildmat.2025.132890",
            "date": "2025/08/20",
            "issuer": "Elsevier - Construction & Building Materials",
            "suggested_score": 60.0,
            "filename": "Ahmed Louay Ahmed - Scopus Research.pdf"
        },
        {
            "ref_code": "REF-AX2-P2-01",
            "axis": "axis2",
            "paragraph": "2",
            "axis_name": "المحور الثاني: النشاط العلمي",
            "paragraph_name": "البحوث المحلية والمؤتمرات والكتب",
            "title": "كتاب تكنولوجيا الخرسانة الحديثة (مقوم علمياً ومنشور في دار نشر أكاديمية)",
            "doc_type": "كتاب منهجي مؤلف",
            "doc_number": "ISBN 978-9922-601-14-2",
            "date": "2025/09/15",
            "issuer": "دار الكتب والوثائق - بغداد",
            "suggested_score": 25.0,
            "filename": "Modern Concrete Book.pdf"
        },
        {
            "ref_code": "REF-AX3-P1-01",
            "axis": "axis3",
            "paragraph": "1",
            "axis_name": "المحور الثالث: الجانب التربوي والتطويري",
            "paragraph_name": "اللجان الدائمية والمؤقتة",
            "title": "أمر إداري بتشكيل لجنة مناقشة مشاريع تخرج المرحلة الخامسة - هندسة العمارة",
            "doc_type": "أمر إداري بتشكيل لجنة",
            "doc_number": "هـ.ع/734",
            "date": "2025/05/20",
            "issuer": "قسم هندسة التصميم المعماري - الجامعة التكنولوجية",
            "suggested_score": 30.0,
            "filename": "أمر لجنة مناقشة تخرج.pdf"
        },
        {
            "ref_code": "REF-AX3-P3-01",
            "axis": "axis3",
            "paragraph": "3",
            "axis_name": "المحور الثالث: الجانب التربوي والتطويري",
            "paragraph_name": "كتب الشكر والتقدير والشهادات",
            "title": "كتاب شكر وتقدير من السيد رئيس الجامعة التكنولوجية المحترم",
            "doc_type": "كتاب شكر وتقدير",
            "doc_number": "م.ر.ج/963",
            "date": "2025/11/10",
            "issuer": "رئاسة الجامعة التكنولوجية - مكتب رئيس الجامعة",
            "suggested_score": 20.0,
            "filename": "شكر وتقدير 963.pdf"
        }
    ]


# إدارة حالة الجلسة لمحرك التصدير
if "form_data" not in st.session_state:
    st.session_state.form_data = get_sample_form_data()
if "attachments" not in st.session_state:
    st.session_state.attachments = get_sample_attachments()


# ==============================================================================
# 5. الشريط الجانبي الذكي لمركز التصدير (Python Engine Sidebar)
# ==============================================================================
with st.sidebar:
    st.image(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Ministry_of_Higher_Education_and_Scientific_Research_%28Iraq%29_logo.png/300px-Ministry_of_Higher_Education_and_Scientific_Research_%28Iraq%29_logo.png",
        width=110
    )
    st.markdown("### 🏛️ مركز التصدير السحابي المعتمد")
    st.caption("تصدير المستندات الرسمية المعتمدة لوزارة التعليم العالي (استمارة 21) بمحرك Python و ReportLab:")

    # احتساب فوري
    eval_res = calculate_evaluation(st.session_state.form_data)
    final_score = eval_res.get("final_score", 0.0)
    rating = eval_res.get("rating", "ضعيف")
    is_capped = eval_res.get("scopus_zero_rule_triggered", False)

    st.metric("الدرجة النهائية المستحقة", f"{final_score:.2f} %", delta=f"التقدير: {rating}")
    if is_capped:
        st.warning("⚠️ سقف التقييم مفعل (75%) لعدم وجود أبحاث Scopus.")

    st.markdown("---")
    st.markdown("#### 📥 تحميل الملفات الرسمية المعتمدة:")

    # 1. تصدير Word (.docx)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp_docx:
        docx_path = tmp_docx.name
    create_form_21_docx(
        data=st.session_state.form_data,
        output_path=docx_path,
        attachments=st.session_state.attachments
    )
    with open(docx_path, "rb") as f:
        docx_bytes = f.read()
    st.download_button(
        label="📄 تحميل استمارة 21 الرسمية (Word .docx)",
        data=docx_bytes,
        file_name=f"استمارة_21_الرسمية_{st.session_state.form_data['personal_info'].get('first_name', 'تدريسي')}.docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        use_container_width=True
    )

    # 2. تصدير PDF (.pdf)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_pdf:
        pdf_path = tmp_pdf.name
    create_form_21_pdf(
        data=st.session_state.form_data,
        output_path=pdf_path,
        attachments=st.session_state.attachments
    )
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    st.download_button(
        label="📑 تحميل استمارة 21 الرسمية (PDF)",
        data=pdf_bytes,
        file_name=f"استمارة_21_الرسمية_{st.session_state.form_data['personal_info'].get('first_name', 'تدريسي')}.pdf",
        mime="application/pdf",
        use_container_width=True
    )

    # 3. تصدير Dossier PDF
    with tempfile.NamedTemporaryFile(delete=False, suffix="_dossier.pdf") as tmp_dossier:
        dossier_path = tmp_dossier.name
    create_consolidated_dossier_pdf(
        data=st.session_state.form_data,
        attachments=st.session_state.attachments,
        output_path=dossier_path
    )
    with open(dossier_path, "rb") as f:
        dossier_bytes = f.read()
    st.download_button(
        label="📦 تحميل المصبار التوثيقي المدمج (Dossier PDF)",
        data=dossier_bytes,
        file_name=f"الملف_التوثيقي_المدمج_{st.session_state.form_data['personal_info'].get('first_name', 'تدريسي')}.pdf",
        mime="application/pdf",
        use_container_width=True
    )

    st.markdown("---")
    with st.expander("🔍 فحص أبحاث Scopus و DOI"):
        doi_input = st.text_input("أدخل معرّف DOI:", value="10.1016/j.conbuildmat.2025.132890")
        if st.button("فحص واحتساب", key="btn_check_doi_side") and isinstance(doi_input, str):
            doi = extract_doi(doi_input.strip())
            if doi:
                meta = fetch_doi_metadata(doi) or {}
                j_name = meta.get("journal", "")
                match = match_offline_journal(j_name) if j_name else None
                cs = match.get("citescore", 1.0) if match else 1.0
                sc = calculate_paper_score_and_role(
                    text=meta.get("title", "") or doi,
                    faculty_name=st.session_state.form_data["personal_info"].get("first_name", "أحمد"),
                    citescore=cs,
                    is_scopus=True
                )
                st.success(f"الدرجة المقترحة: +{sc.get('suggested_score', 60.0)} ({sc.get('author_role', 'باحث')})")
                st.info(f"المجلة: {j_name or 'Scopus Journal'} (CiteScore: {cs})")
