"""
منصة تقييم أداء أعضاء الهيئة التدريسية - استمارة رقم (21)
وزارة التعليم العالي والبحث العلمي - جهاز الإشراف والتقويم العلمي
تطبيق Streamlit السحابي المتكامل
"""

import os
import re
import json
import tempfile
import streamlit as st

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
from core.document_parser import deep_scan_and_index_document
from core.ocr_engine import process_document

# ==============================================================================
# إعدادات الصفحة والتصميم العربي (RTL)
# ==============================================================================
st.set_page_config(
    page_title="منصة تقييم أداء الهيئة التدريسية - استمارة 21",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="expanded"
)

CUSTOM_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');

html, body, [class*="css"], .stApp {
    font-family: 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif !important;
    direction: rtl !important;
    text-align: right !important;
}

/* بطاقات وتصميم أنيق */
.main-header {
    background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%);
    color: white;
    padding: 1.5rem 2rem;
    border-radius: 14px;
    margin-bottom: 1.5rem;
    box-shadow: 0 4px 15px rgba(30, 58, 138, 0.15);
}
.main-header h1 {
    color: #ffffff !important;
    font-size: 1.6rem !important;
    font-weight: 800;
    margin-bottom: 0.3rem;
}
.main-header p {
    color: #e0e7ff !important;
    font-size: 0.95rem;
    margin: 0;
}

.score-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.2rem;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.score-value {
    font-size: 2.2rem;
    font-weight: 900;
    color: #1e3a8a;
    line-height: 1.2;
}
.score-label {
    font-size: 0.85rem;
    font-weight: 700;
    color: #64748b;
}

.alert-warning-scopus {
    background-color: #fffbeb;
    border-right: 5px solid #d97706;
    padding: 1rem;
    border-radius: 8px;
    margin: 1rem 0;
    color: #92400e;
    font-weight: 600;
}

/* تحسين الجداول والمدخلات */
div[data-testid="stMetricValue"] {
    font-family: 'Cairo', sans-serif !important;
}
.stTabs [data-baseweb="tab-list"] {
    gap: 8px;
    direction: rtl;
}
.stTabs [data-baseweb="tab"] {
    border-radius: 8px 8px 0 0;
    padding: 10px 18px;
    font-weight: 700;
}
button[kind="primary"] {
    background-color: #1e3a8a !important;
    border-color: #1e3a8a !important;
}
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# ==============================================================================
# التهيئة والبيانات الافتراضية
# ==============================================================================
def get_empty_form_data():
    return {
        "personal_info": {
            "university": "الجامعة التكنولوجية",
            "college": "كلية هندسة العمارة",
            "department": "قسم هندسة التصميم المعماري",
            "form_no": "",
            "form_code": "",
            "first_name": "",
            "father_name": "",
            "grandfather_name": "",
            "great_grandfather_name": "",
            "last_name": "",
            "mother_name": "",
            "mother_father_name": "",
            "mother_grandfather_name": "",
            "national_id": "",
            "registry_no": "",
            "page_no": "",
            "issue_year": "",
            "issue_month": "",
            "issue_day": "",
            "degree": "دكتوراه",
            "order_no_and_date": "",
            "degree_year": "",
            "degree_month": "",
            "degree_day": "",
            "granting_country": "العراق",
            "granting_univ": "الجامعة التكنولوجية",
            "granting_college": "كلية هندسة العمارة",
            "granting_dept": "قسم هندسة التصميم المعماري",
            "general_specialty": "هندسة معمارية",
            "specific_specialty": "تصميم معماري وتكنولوجيا البناء",
            "academic_title": "أستاذ مساعد",
            "title_granter": "مجلس الجامعة التكنولوجية",
            "title_year": "",
            "title_month": "",
            "title_day": "",
            "phone": "",
            "email": "ahmed.l.ahmed@uotechnology.edu.iq"
        },
        "is_non_teaching": False,
        "axis1": {
            "courses_score": 0.0,
            "classroom_management_score": 0.0,
            "blended_learning_items": [0, 0, 0, 0],
            "course_description_items": [0, 0, 0, 0, 0],
            "job_commitment_items": [0, 0, 0, 0, 0]
        },
        "axis2": {
            "global_research_score": 0.0,
            "local_research_score": 0.0,
            "supervision_score": 0.0
        },
        "axis3": {
            "committees_score": 0.0,
            "continuous_learning_score": 0.0,
            "thank_you_score": 0.0,
            "field_visits_score": 0.0
        },
        "axis4": {
            "items": {}
        },
        "axis5": {
            "penalties": []
        }
    }


def get_sample_form_data():
    sample = get_empty_form_data()
    sample["personal_info"].update({
        "first_name": "أحمد",
        "father_name": "لؤي",
        "grandfather_name": "أحمد",
        "last_name": "",
        "mother_name": "فاطمة",
        "mother_father_name": "محمد",
        "mother_grandfather_name": "علي",
        "national_id": "198520349812",
        "registry_no": "142",
        "page_no": "58",
        "form_no": "2026/0412",
        "form_code": "AGY-2026-ARCH-01",
        "issue_year": "2021",
        "issue_month": "05",
        "issue_day": "12",
        "order_no_and_date": "ق/452 في 2018/06/10",
        "degree_year": "2018",
        "degree_month": "06",
        "degree_day": "10",
        "title_year": "2022",
        "title_month": "03",
        "title_day": "15",
        "phone": "07701234567",
        "email": "ahmed.l.ahmed@uotechnology.edu.iq"
    })
    sample["axis1"] = {
        "courses_score": 20.0,
        "classroom_management_score": 20.0,
        "blended_learning_items": [5, 5, 5, 5],
        "course_description_items": [4, 4, 4, 4, 4],
        "job_commitment_items": [4, 4, 4, 4, 4]
    }
    sample["axis2"] = {
        "global_research_score": 60.0,
        "local_research_score": 25.0,
        "supervision_score": 15.0
    }
    sample["axis3"] = {
        "committees_score": 30.0,
        "continuous_learning_score": 20.0,
        "thank_you_score": 20.0,
        "field_visits_score": 30.0
    }
    sample["axis4"] = {
        "items": {"item1": 3, "item2": 4, "item11": 3}
    }
    return sample


def get_sample_attachments():
    return [
        {
            "ref_code": "REF-AX1-P1-01",
            "axis": "axis1",
            "paragraph": "1",
            "axis_name": "المحور الأول: جودة التدريس والتعليم والالتزام الوظيفي",
            "paragraph_name": "1. المقررات الدراسية",
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
            "axis_name": "المحور الثاني: النشاط العلمي والبحثي",
            "paragraph_name": "1. بحوث المستوعبات العالمية (Clarivate / Scopus)",
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
            "axis_name": "المحور الثاني: النشاط العلمي والبحثي",
            "paragraph_name": "2. البحوث في المجلات العربية والمحلية والمؤتمرات والكتب",
            "title": "كتاب تكنولوجيا الخرسانة الحديثة (مقوم علمياً ومنشور في دار نشر أكاديمية)",
            "doc_type": "كتاب منهجي مؤلف",
            "doc_number": "ISBN 978-9922-601-14-2",
            "date": "2025/09/15",
            "issuer": "دار دجلة للطباعة والنشر والتوزيع",
            "suggested_score": 20.0,
            "filename": "أمر جامعي بنشر كتاب وبحث 925.pdf"
        },
        {
            "ref_code": "REF-AX3-P1-01",
            "axis": "axis3",
            "paragraph": "1",
            "axis_name": "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
            "paragraph_name": "1. المشاركة في اللجان",
            "title": "أمر إداري بتشكيل اللجنة الامتحانية المركزية للعام الدراسي 2025-2026",
            "doc_type": "أمر تشكيل لجنة امتحانية",
            "doc_number": "4892",
            "date": "2025/09/28",
            "issuer": "رئاسة الجامعة التكنولوجية",
            "suggested_score": 30.0,
            "filename": "أمر تشكيل لجنة مناقشة مشاريع التخرج.pdf"
        },
        {
            "ref_code": "REF-AX3-P2-01",
            "axis": "axis3",
            "paragraph": "2",
            "axis_name": "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
            "paragraph_name": "2. التعليم المستمر والجودة",
            "title": "شهادة إلقاء دورة تدريبية تخصصية في برنامج Revit Architecture للمهندسين",
            "doc_type": "شهادة محاضر بالتعليم المستمر",
            "doc_number": "م.ت.م/108",
            "date": "2025/11/04",
            "issuer": "مركز التعليم المستمر - الجامعة التكنولوجية",
            "suggested_score": 10.0,
            "filename": "احتساب عمل تطوعي وتعليم مستمر.pdf"
        },
        {
            "ref_code": "REF-AX3-P3-01",
            "axis": "axis3",
            "paragraph": "3",
            "axis_name": "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
            "paragraph_name": "3. كتب الشكر والتقدير",
            "title": "كتاب شكر وتقدير للجهود المتميزة في النشر العلمي والارتقاء بالتصنيف الأكاديمي",
            "doc_type": "كتاب شكر وتقدير رسمي",
            "doc_number": "م.و/1042",
            "date": "2025/11/15",
            "issuer": "معالي وزير التعليم العالي والبحث العلمي",
            "suggested_score": 20.0,
            "filename": "كتاب شكر وتقدير وزاري 963.pdf"
        },
        {
            "ref_code": "REF-AX4-P1-01",
            "axis": "axis4",
            "paragraph": "2",
            "axis_name": "المحور الرابع: مواطن القوة",
            "paragraph_name": "2. معامل هيرش h-index",
            "title": "توثيق امتلاك معامل هيرش Scopus h-index = 7 معتمد رسمياً",
            "doc_type": "تقرير صفحة الباحث في Scopus",
            "doc_number": "Scopus-Author-572019482",
            "date": "2025/10/05",
            "issuer": "منظومة سكوباس العالمية",
            "suggested_score": 4.0,
            "filename": "عضوية تحرير المجلة ومواطن القوة.pdf"
        }
    ]


# إدارة حالة الجلسة (Session State)
if "form_data" not in st.session_state:
    st.session_state.form_data = get_empty_form_data()
if "attachments" not in st.session_state:
    st.session_state.attachments = []


# ==============================================================================
# الشريط الجانبي (Sidebar)
# ==============================================================================
with st.sidebar:
    st.image("https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Ministry_of_Higher_Education_and_Scientific_Research_%28Iraq%29_logo.png/300px-Ministry_of_Higher_Education_and_Scientific_Research_%28Iraq%29_logo.png", width=120)
    st.title("الخيارات السريعة")

    if st.button("🚀 تعبئة بيانات تجريبية (هندسة العمارة)", use_container_width=True):
        st.session_state.form_data = get_sample_form_data()
        st.session_state.attachments = get_sample_attachments()
        st.success("تم تحميل البيانات التجريبية والمرفقات بنجاح!")
        st.rerun()

    if st.button("🔄 إعادة ضبط وتفريغ البيانات", use_container_width=True):
        st.session_state.form_data = get_empty_form_data()
        st.session_state.attachments = []
        st.info("تم تفريغ الحقول وإعادة الضبط.")
        st.rerun()

    st.markdown("---")
    
    # احتساب فوري للدرجة لعرضها في الشريط الجانبي
    eval_res = calculate_evaluation(st.session_state.form_data)
    final_score = eval_res.get("final_score", 0.0)
    rating = eval_res.get("rating", "ضعيف")
    is_capped = eval_res.get("scopus_zero_rule_triggered", False)

    st.metric("الدرجة النهائية المستحقة", f"{final_score:.2f} %", delta=f"التقدير: {rating}")
    if is_capped:
        st.warning("⚠️ سقف التقييم مفعل (75%) لعدم وجود أبحاث Scopus.")

    st.markdown("---")
    nav_choice = st.radio(
        "الانتقال السريع للأقسام:",
        [
            "📋 البيانات الشخصية والأكاديمية",
            "🎓 المحور 1: التدريسي (50%)",
            "🔬 المحور 2: العلمي والبحثي (30%)",
            "🤝 المحور 3: التربوي والإرشادي (20%)",
            "🌟 المحور 4 و 5: مواطن القوة والعقوبات",
            "🔍 فحص أبحاث Scopus و DOI",
            "📑 مسح وفهرسة المرفقات",
            "📊 النتائج والتصدير (Word & PDF)"
        ]
    )

# الترويسة الرئيسية
st.markdown("""
<div class="main-header">
    <h1>🏛️ منصة تقييم أداء أعضاء الهيئة التدريسية (استمارة 21)</h1>
    <p>جمهورية العراق - وزارة التعليم العالي والبحث العلمي - جهاز الإشراف والتقويم العلمي - دائرة ضمان الجودة</p>
</div>
""", unsafe_allow_html=True)


# ==============================================================================
# 1. البيانات الشخصية والأكاديمية
# ==============================================================================
if nav_choice == "📋 البيانات الشخصية والأكاديمية":
    st.subheader("1. البيانات الشخصية والوظيفية للتدريسي")
    p = st.session_state.form_data["personal_info"]

    col1, col2, col3 = st.columns(3)
    with col1:
        p["university"] = st.text_input("الجامعة / الهيئة", value=p.get("university", "الجامعة التكنولوجية"))
        p["first_name"] = st.text_input("الاسم الأول", value=p.get("first_name", ""))
        p["mother_name"] = st.text_input("اسم الأم", value=p.get("mother_name", ""))
        p["national_id"] = st.text_input("رقم البطاقة الوطنية / الجنسية", value=p.get("national_id", ""))
    with col2:
        p["college"] = st.text_input("الكلية / المعهد", value=p.get("college", "كلية هندسة العمارة"))
        p["father_name"] = st.text_input("اسم الأب", value=p.get("father_name", ""))
        p["mother_father_name"] = st.text_input("اسم والد الأم", value=p.get("mother_father_name", ""))
        p["academic_title"] = st.selectbox(
            "اللقب العلمي الحالي",
            ["مدرس مساعد", "مدرس", "أستاذ مساعد", "أستاذ"],
            index=["مدرس مساعد", "مدرس", "أستاذ مساعد", "أستاذ"].index(p.get("academic_title", "أستاذ مساعد"))
        )
    with col3:
        p["department"] = st.text_input("القسم العلمي", value=p.get("department", "قسم هندسة التصميم المعماري"))
        p["grandfather_name"] = st.text_input("اسم الجد", value=p.get("grandfather_name", ""))
        p["degree"] = st.selectbox("الشهادة", ["ماجستير", "دكتوراه"], index=1 if p.get("degree") == "دكتوراه" else 0)
        p["email"] = st.text_input("البريد الإلكتروني الجامعي", value=p.get("email", "ahmed.l.ahmed@uotechnology.edu.iq"))

    st.markdown("---")
    st.session_state.form_data["is_non_teaching"] = st.checkbox(
        "تدريسي غير متفرغ أو غير مكلف بمهام تدريسية (حساب المحور الأول وفق النسبة الوزارية 50% من الفقرة 5)",
        value=st.session_state.form_data.get("is_non_teaching", False)
    )


# ==============================================================================
# 2. المحور الأول: التدريسي
# ==============================================================================
elif nav_choice == "🎓 المحور 1: التدريسي (50%)":
    st.subheader("المحور الأول: جودة التدريس والتعليم والالتزام الوظيفي (الوزن: 50%)")
    a1 = st.session_state.form_data["axis1"]

    if st.session_state.form_data.get("is_non_teaching"):
        st.info("ℹ️ وضع غير المكلف بمهام تدريسية مفعل: تعتمد درجة الفقرة 5 فقط كوزن كامل للمحور الأول بنسبة 50%.")
    
    col1, col2 = st.columns(2)
    with col1:
        a1["courses_score"] = st.number_input("1. المقررات الدراسية (الحد الأقصى: 20)", min_value=0.0, max_value=20.0, value=float(a1.get("courses_score", 0.0)), step=1.0)
        a1["classroom_management_score"] = st.number_input("2. إدارة الصف والعلاقة مع الطلبة (الحد الأقصى: 20)", min_value=0.0, max_value=20.0, value=float(a1.get("classroom_management_score", 0.0)), step=1.0)
    with col2:
        st.markdown("**3. التعليم المدمج والمنصات التعليمية (4 بنود x 5 = 20)**")
        b_items = a1.get("blended_learning_items", [0, 0, 0, 0])
        b0 = st.checkbox("استخدام Google Classroom أو Moodle", value=b_items[0] > 0)
        b1 = st.checkbox("رفع المحاضرات الإلكترونية والمصادر", value=b_items[1] > 0)
        b2 = st.checkbox("إجراء الاختبارات والواجبات إلكترونياً", value=b_items[2] > 0)
        b3 = st.checkbox("التفاعل الإيجابي في المنصة الأكاديمية", value=b_items[3] > 0)
        a1["blended_learning_items"] = [5 if b0 else 0, 5 if b1 else 0, 5 if b2 else 0, 5 if b3 else 0]

    st.markdown("---")
    col3, col4 = st.columns(2)
    with col3:
        st.markdown("**4. وصف المقرر والمناهج (5 بنود x 4 = 20)**")
        c_items = a1.get("course_description_items", [0, 0, 0, 0, 0])
        c0 = st.checkbox("إعداد وتحديث استمارة وصف المقرر", value=c_items[0] > 0)
        c1 = st.checkbox("توزيع خطة المنهاج على الطلبة", value=c_items[1] > 0)
        c2 = st.checkbox("تطوير المفردات ومواكبة الحداثة", value=c_items[2] > 0)
        c3 = st.checkbox("تحديد أهداف ومخرجات التعلم", value=c_items[3] > 0)
        c4 = st.checkbox("تقييم وتطوير طرائق التدريس", value=c_items[4] > 0)
        a1["course_description_items"] = [4 if c0 else 0, 4 if c1 else 0, 4 if c2 else 0, 4 if c3 else 0, 4 if c4 else 0]
    with col4:
        st.markdown("**5. الالتزام الوظيفي والأخلاقي (5 بنود x 4 = 20)**")
        j_items = a1.get("job_commitment_items", [0, 0, 0, 0, 0])
        j0 = st.checkbox("الالتزام بمواعيد الدوام الرسمي", value=j_items[0] > 0)
        j1 = st.checkbox("إنجاز المهام والواجبات بدقة", value=j_items[1] > 0)
        j2 = st.checkbox("التعاون الإيجابي مع الزملاء والرئاسة", value=j_items[2] > 0)
        j3 = st.checkbox("الالتزام بأخلاقيات المهنة الجامعية", value=j_items[3] > 0)
        j4 = st.checkbox("المشاركة الفعالة في الأنشطة المؤسسية", value=j_items[4] > 0)
        a1["job_commitment_items"] = [4 if j0 else 0, 4 if j1 else 0, 4 if j2 else 0, 4 if j3 else 0, 4 if j4 else 0]


# ==============================================================================
# 3. المحور الثاني: العلمي والبحثي
# ==============================================================================
elif nav_choice == "🔬 المحور 2: العلمي والبحثي (30%)":
    st.subheader("المحور الثاني: النشاط العلمي والبحثي (الوزن: 30%)")
    a2 = st.session_state.form_data["axis2"]

    st.markdown("""
    > [!IMPORTANT]
    > **القيد الوزاري:** إذا كانت درجة "بحوث المستوعبات العالمية (Scopus/Clarivate)" تساوي **صفر**، فلن تتجاوز درجة التقييم النهائية **75%** كحد أقصى.
    """)

    col1, col2, col3 = st.columns(3)
    with col1:
        a2["global_research_score"] = st.number_input(
            "1. بحوث المستوعبات العالمية (Scopus/Clarivate) - (أقصى درجة: 60)",
            min_value=0.0, max_value=60.0, value=float(a2.get("global_research_score", 0.0)), step=5.0
        )
    with col2:
        a2["local_research_score"] = st.number_input(
            "2. البحوث المحلية والمؤتمرات والكتب - (أقصى درجة: 25)",
            min_value=0.0, max_value=25.0, value=float(a2.get("local_research_score", 0.0)), step=5.0
        )
    with col3:
        a2["supervision_score"] = st.number_input(
            "3. الإشراف على طلبة الدراسات والتقويم العلمي - (أقصى درجة: 15)",
            min_value=0.0, max_value=15.0, value=float(a2.get("supervision_score", 0.0)), step=2.5
        )


# ==============================================================================
# 4. المحور الثالث: التربوي والمجتمعي
# ==============================================================================
elif nav_choice == "🤝 المحور 3: التربوي والإرشادي (20%)":
    st.subheader("المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر (الوزن: 20%)")
    a3 = st.session_state.form_data["axis3"]

    col1, col2 = st.columns(2)
    with col1:
        a3["committees_score"] = st.number_input("1. المشاركة في اللجان الوزارية والجامعية (الحد الأقصى: 30)", min_value=0.0, max_value=30.0, value=float(a3.get("committees_score", 0.0)), step=5.0)
        a3["continuous_learning_score"] = st.number_input("2. التعليم المستمر وورش العمل والدورات (الحد الأقصى: 20)", min_value=0.0, max_value=20.0, value=float(a3.get("continuous_learning_score", 0.0)), step=5.0)
    with col2:
        a3["thank_you_score"] = st.number_input("3. كتب الشكر والتقدير (الحد الأقصى: 20)", min_value=0.0, max_value=20.0, value=float(a3.get("thank_you_score", 0.0)), step=5.0)
        a3["field_visits_score"] = st.number_input("4. الزيارات الميدانية والأعمال التطوعية (الحد الأقصى: 30)", min_value=0.0, max_value=30.0, value=float(a3.get("field_visits_score", 0.0)), step=5.0)


# ==============================================================================
# 5. مواطن القوة والعقوبات
# ==============================================================================
elif nav_choice == "🌟 المحور 4 و 5: مواطن القوة والعقوبات":
    st.subheader("المحور الرابع: مواطن القوة (حتى 5 درجات إضافية للمجموع)")
    a4 = st.session_state.form_data["axis4"].setdefault("items", {})

    col1, col2 = st.columns(2)
    with col1:
        h_index_opt = st.selectbox(
            "معامل هيرش Scopus h-index",
            ["لا يوجد (0)", "h-index بين 3-6 (درجتان)", "h-index من 7 فأكثر (4 درجات)"],
            index=2 if a4.get("item2", 0) == 4 else (1 if a4.get("item2", 0) == 2 else 0)
        )
        if "4 درجات" in h_index_opt:
            a4["item2"] = 4
        elif "درجتان" in h_index_opt:
            a4["item2"] = 2
        else:
            a4.pop("item2", None)

        p1 = st.checkbox("نشر بحث في مجلة Nature أو Science (5 درجات)", value=a4.get("item1", 0) == 5)
        if p1: a4["item1"] = 5
        else: a4.pop("item1", None)

    with col2:
        p3 = st.checkbox("الحصول على براءة اختراع مسجلة (4 درجات)", value=a4.get("item3", 0) == 4)
        if p3: a4["item3"] = 4
        else: a4.pop("item3", None)

        p11 = st.checkbox("عضوية هيئة تحرير مجلة علمية مصنفة (3 درجات)", value=a4.get("item11", 0) == 3)
        if p11: a4["item11"] = 3
        else: a4.pop("item11", None)

    st.markdown("---")
    st.subheader("المحور الخامس: خصم العقوبات الانضباطية (خصم مباشر من المجموع)")
    a5 = st.session_state.form_data["axis5"]
    penalties_options = [
        ("لفت نظر (-3 درجات)", 3),
        ("إنذار (-5 درجات)", 5),
        ("قطع راتب (-7 درجات)", 7),
        ("توبيخ (-11 درجة)", 11),
        ("إنقاص راتب (-13 درجة)", 13),
        ("تنزيل درجة (-15 درجة)", 15)
    ]
    selected_penalties = st.multiselect(
        "اختر العقوبات الصادرة بحق التدريسي خلال العام (إن وجدت):",
        [p[0] for p in penalties_options]
    )
    a5["penalties"] = [p[1] for p in penalties_options if p[0] in selected_penalties]


# ==============================================================================
# 6. فحص أبحاث Scopus و DOI
# ==============================================================================
elif nav_choice == "🔍 فحص أبحاث Scopus و DOI":
    st.subheader("التحقق والمسح الآلي لمعرفات DOI وأبحاث مستوعبات Scopus")
    doi_input = st.text_input("أدخل معرف البحث الرقمي (DOI) أو رابط المقال:", value="10.1016/j.conbuildmat.2025.132890")
    
    if st.button("🔎 فحص واحتساب الدرجة آلياً"):
        doi = extract_doi(doi_input)
        if not doi:
            st.error("تعذر استخراج معرف DOI صالح من المدخل.")
        else:
            with st.spinner("جارٍ التحقق من قاعدة بيانات Scopus و Crossref..."):
                crossref_data = fetch_doi_metadata(doi) or {}
                journal_title = crossref_data.get("journal", "") or crossref_data.get("journal_title", "")
                paper_title = crossref_data.get("title", "")
                pub_year = crossref_data.get("year", "")
                
                scopus_match = match_offline_journal(journal_title) if journal_title else None
                citescore = scopus_match.get("citescore", 1.0) if scopus_match else (1.0 if journal_title else 0.0)
                is_scopus = scopus_match.get("is_scopus", True) if scopus_match else bool(journal_title)

                # احتساب الدرجة
                authors_str = " ".join(crossref_data.get("authors", []))
                scoring = calculate_paper_score_and_role(
                    text=f"{paper_title} {authors_str}".strip() or doi,
                    faculty_name=st.session_state.form_data["personal_info"].get("first_name", "أحمد"),
                    citescore=citescore,
                    is_scopus=is_scopus
                )
                score = scoring.get("suggested_score", 0.0)
                role = scoring.get("author_role", "باحث مشارك")
                reason = scoring.get("rule_description", "")

                st.success("تم فحص بيانات البحث بنجاح! ✔")
                col1, col2 = st.columns(2)
                with col1:
                    st.write(f"**عنوان البحث:** {paper_title or 'Research Paper'}")
                    st.write(f"**المجلة:** {journal_title or 'غير محدد'}")
                    st.write(f"**سنة النشر:** {pub_year or 'غير محدد'}")
                with col2:
                    st.write(f"**معامل الاستشهاد CiteScore:** {citescore}")
                    st.write(f"**تصنيف المستوعب:** {'Scopus مفهرس' if is_scopus else 'محلي'}")
                    st.write(f"**الدرجة المستحقة المحسوبة:** +{score} درجة ({role})")

                if st.button("➕ إضافة الدرجة لمحفظة المحور الثاني"):
                    st.session_state.form_data["axis2"]["global_research_score"] = min(60.0, float(score))
                    st.success("تم تحديث درجة أبحاث Scopus في المحور الثاني!")


# ==============================================================================
# 7. مسح وفهرسة المرفقات (OCR & AI)
# ==============================================================================
elif nav_choice == "📑 مسح وفهرسة المرفقات":
    st.subheader("مسح وقراءة وثائق الإثبات بالذكاء الاصطناعي (OCR)")
    uploaded_file = st.file_uploader("ارفع وثيقة إثبات (PDF أو صورة JPG/PNG)", type=["pdf", "png", "jpg", "jpeg"])

    if uploaded_file is not None:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(uploaded_file.name)[1]) as tmp:
            tmp.write(uploaded_file.getbuffer())
            tmp_path = tmp.name

        with st.spinner("جارٍ قراءة النص والتعرف على خط اليد وتحليل الوثيقة..."):
            ocr_res = process_document(tmp_path)
            raw_text = ocr_res.get("text", "")
            indexed_doc = deep_scan_and_index_document(
                text=raw_text,
                filename=uploaded_file.name,
                counter=len(st.session_state.attachments) + 1
            )

        st.success("تم استخراج بيانات الوثيقة وفهرستها بنجاح! 🎉")
        col1, col2 = st.columns(2)
        with col1:
            st.write(f"**رمز الفهرسة المولد:** `{indexed_doc['ref_code']}`")
            st.write(f"**نوع الوثيقة المستنتج:** {indexed_doc.get('doc_type', 'وثيقة رسمية')}")
            st.write(f"**العدد الإداري:** {indexed_doc.get('doc_number', '-')}")
            st.write(f"**التاريخ:** {indexed_doc.get('date', '-')}")
        with col2:
            st.write(f"**المحور المقترح:** {indexed_doc.get('axis_name', '')}")
            st.write(f"**الفقرة المقترحة:** {indexed_doc.get('paragraph_name', '')}")
            st.write(f"**الدرجة المقترحة:** +{indexed_doc.get('suggested_score', 0)} درجات")

        if st.button("📥 اعتماد وإضافة الوثيقة إلى الفهرس الرسمي"):
            indexed_doc["filename"] = uploaded_file.name
            st.session_state.attachments.append(indexed_doc)
            st.success("تمت إضافة الوثيقة إلى الفهرس المعتمد!")
            st.rerun()

    # عرض جدول الوثائق المفهرسة الحالية
    st.markdown("---")
    st.subheader(f"الفهرس الشامل للوثائق المعتمدة ({len(st.session_state.attachments)} وثائق)")
    if st.session_state.attachments:
        for idx, att in enumerate(st.session_state.attachments):
            with st.expander(f"📌 [{att.get('ref_code')}] - {att.get('title', att.get('filename'))}"):
                c1, c2, c3 = st.columns([2, 1, 1])
                c1.write(f"**النوع:** {att.get('doc_type')} | **العدد:** {att.get('doc_number')} | **التاريخ:** {att.get('date')}")
                c2.write(f"**المحور والفقرة:** {att.get('axis_name', att.get('axis'))} - ف{att.get('paragraph')}")
                c3.write(f"**الدرجة:** +{att.get('suggested_score')}")
                if st.button(f"🗑️ حذف المرفق", key=f"del_{att.get('ref_code')}_{idx}"):
                    st.session_state.attachments.pop(idx)
                    st.rerun()
    else:
        st.info("لا توجد مرفقات معتمدة حالياً. يمكنك استخدام زر 'تعبئة بيانات تجريبية' من القائمة الجانبية.")


# ==============================================================================
# 8. النتائج والتقييم النهائي والتصدير (Word & PDF)
# ==============================================================================
elif nav_choice == "📊 النتائج والتصدير (Word & PDF)":
    st.subheader("النتائج النهائية والتفقيط الرسمي وتصدير استمارة 21")
    eval_res = calculate_evaluation(st.session_state.form_data)
    final_score = eval_res.get("final_score", 0.0)
    rating = eval_res.get("rating", "ضعيف")
    words = eval_res.get("score_in_words", "")
    is_capped = eval_res.get("scopus_zero_rule_triggered", False)

    col1, col2, col3 = st.columns(3)
    with col1:
        st.markdown(f"""
        <div class="score-card">
            <div class="score-label">مجموع الدرجة النهائية رقماً</div>
            <div class="score-value">{final_score:.2f} %</div>
        </div>
        """, unsafe_allow_html=True)
    with col2:
        st.markdown(f"""
        <div class="score-card">
            <div class="score-label">التقدير النهائي المعتمد</div>
            <div class="score-value" style="color: #15803d;">{rating}</div>
        </div>
        """, unsafe_allow_html=True)
    with col3:
        st.markdown(f"""
        <div class="score-card">
            <div class="score-label">مجموع المرفقات الموثقة</div>
            <div class="score-value" style="color: #2563eb;">{len(st.session_state.attachments)}</div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")
    st.info(f"**التفقيط العربي الرسمي:** {words}")

    if is_capped:
        st.markdown("""
        <div class="alert-warning-scopus">
            ⚠️ تنبيه وزاري رسمي: تم تفعيل قيد سقف التقييم (75%) لعدم تسجيل أي بحث منشور في مستوعبات Scopus / Clarivate خلال عام التقييم.
        </div>
        """, unsafe_allow_html=True)

    # جدول المحاور الموزونة
    st.markdown("### جدول تفاصيل الدرجات الموزونة:")
    axes_data = [
        {"المحور": "المحور الأول: جودة التدريس", "الوزن": "50%", "الدرجة المستحقة": f"{eval_res.get('axis1', {}).get('weighted_score', 0):.2f}"},
        {"المحور": "المحور الثاني: النشاط العلمي والبحثي", "الوزن": "30%", "الدرجة المستحقة": f"{eval_res.get('axis2', {}).get('weighted_score', 0):.2f}"},
        {"المحور": "المحور الثالث: الجانب التربوي والإرشادي", "الوزن": "20%", "الدرجة المستحقة": f"{eval_res.get('axis3', {}).get('weighted_score', 0):.2f}"},
        {"المحور": "المحور الرابع: مواطن القوة (إضافي)", "الوزن": "حتى +5", "الدرجة المستحقة": f"+{eval_res.get('axis4', {}).get('total_points', 0):.2f}"},
        {"المحور": "المحور الخامس: خصم العقوبات", "الوزن": "خصم مباشر", "الدرجة المستحقة": f"-{eval_res.get('axis5', {}).get('total_deduction', 0):.2f}"},
    ]
    st.table(axes_data)

    st.markdown("---")
    st.subheader("📥 التصدير الرسمي للاستمارة رقم (21)")
    col_w, col_p, col_d = st.columns(3)

    # 1. تصدير Word
    with col_w:
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
            label="📄 تحميل ملف Word (.docx)",
            data=docx_bytes,
            file_name=f"استمارة_21_{st.session_state.form_data['personal_info'].get('first_name', 'تدريسي')}.docx",
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            use_container_width=True
        )

    # 2. تصدير PDF
    with col_p:
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
            label="📑 تحميل استمارة 21 (PDF)",
            data=pdf_bytes,
            file_name=f"استمارة_21_{st.session_state.form_data['personal_info'].get('first_name', 'تدريسي')}.pdf",
            mime="application/pdf",
            use_container_width=True
        )

    # 3. تصدير Dossier PDF
    with col_d:
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
            label="📦 تحميل الملف التوثيقي الشامل (Dossier)",
            data=dossier_bytes,
            file_name=f"الملف_التوثيقي_{st.session_state.form_data['personal_info'].get('first_name', 'تدريسي')}.pdf",
            mime="application/pdf",
            use_container_width=True
        )
