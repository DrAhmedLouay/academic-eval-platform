"""
محرك احتساب درجات استمارة تقييم أداء أعضاء الهيئة التدريسية (استمارة رقم 21)
للعام الدراسي 2025-2026 - وزارة التعليم العالي والبحث العلمي العراقية
"""
from typing import Dict, Any, Tuple

# قاموس العقوبات ومقادير الخصم
PENALTIES_MAP = {
    "notice": {"name": "لفت نظر", "deduction": 3},
    "warning": {"name": "الإنذار", "deduction": 5},
    "salary_cut": {"name": "قطع الراتب", "deduction": 7},
    "reprimand": {"name": "التوبيخ", "deduction": 11},
    "salary_reduction": {"name": "إنقاص الراتب", "deduction": 13},
    "grade_demotion": {"name": "تنزيل الدرجة", "deduction": 15}
}

# تفقيط الأعداد باللغة العربية
ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"]
TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"]
TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"]


def number_to_arabic_words(number: float) -> str:
    """تحويل الدرجة الرقمية إلى نص مقروء باللغة العربية (تفقيط رسمي)"""
    if number < 0:
        return "صفر درجة"
    
    rounded_num = round(number, 2)
    integer_part = int(rounded_num)
    fractional_part = int(round((rounded_num - integer_part) * 100))

    if integer_part == 0 and fractional_part == 0:
        return "صفر درجة فقط لا غير"
    elif integer_part == 100:
        int_str = "مئة"
    elif integer_part > 100:
        int_str = "مئة"
    else:
        if integer_part < 10:
            int_str = ONES[integer_part]
        elif 10 <= integer_part < 20:
            int_str = TEENS[integer_part - 10]
        else:
            unit = integer_part % 10
            ten = integer_part // 10
            if unit == 0:
                int_str = TENS[ten]
            else:
                int_str = f"{ONES[unit]} و{TENS[ten]}"

    result = f"{int_str} درجة"
    
    if fractional_part > 0:
        if fractional_part == 50 or fractional_part == 5:
            result += " ونصف"
        elif fractional_part == 25:
            result += " وربع"
        elif fractional_part == 75:
            result += " وثلاثة أرباع"
        else:
            result += f" و{fractional_part} من مئة"

    return f"{result} فقط لا غير"


def calculate_evaluation(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    احتساب كافة درجات الاستمارة والمحاور وتطبيق الأوزان والشروط الوزارية
    يدعم كلاً من استمارة رقم 39 (مسار بولونيا) واستمارة رقم 21 (المسار العام)
    """
    if data.get("form_type") == "form39" or "axis1_bologna" in data or "axis2_portfolio" in data:
        return calculate_evaluation_form39(data)

    is_non_teaching = bool(data.get("is_non_teaching", False))
    warnings = []

    # =========================================================================
    # المحور الأول : جودة التدريس والتعليم والالتزام الوظيفي (50%)
    # =========================================================================
    axis1_data = data.get("axis1", {})
    
    if is_non_teaching:
        # التدريسي غير المكلف بمهام تدريسية: تحتسب له الفقرة 5 فقط وتمثل درجة المحور بأكمله (100 درجة)
        # 5 فقرات كل فقرة 20 درجة
        commitment_items = axis1_data.get("job_commitment_items", [0, 0, 0, 0, 0])
        p5_score = sum(min(20, max(0, float(x))) for x in commitment_items[:5])
        axis1_items = {
            "p1": 0.0,
            "p2": 0.0,
            "p3": 0.0,
            "p4": 0.0,
            "p5": min(100.0, p5_score)
        }
        axis1_raw_total = axis1_items["p5"]
    else:
        # 1. المقررات (القصوى 20)
        p1 = min(20.0, float(axis1_data.get("courses_score", 0)))
        # 2. إدارة الصف والاستبيان (القصوى 20)
        p2 = min(20.0, float(axis1_data.get("classroom_management_score", 0)))
        # 3. التعليم المدمج (4 فقرات، 5 درجات لكل فقرة، القصوى 20)
        blended_items = axis1_data.get("blended_learning_items", [0, 0, 0, 0])
        p3 = min(20.0, sum(min(5.0, max(0.0, float(x))) for x in blended_items[:4]))
        # 4. وصف المقرر وتحديثه (5 فقرات، 4 درجات لكل فقرة، القصوى 20)
        course_desc_items = axis1_data.get("course_description_items", [0, 0, 0, 0, 0])
        p4 = min(20.0, sum(min(4.0, max(0.0, float(x))) for x in course_desc_items[:5]))
        # 5. الالتزام الوظيفي (5 فقرات، 4 درجات لكل فقرة، القصوى 20)
        commitment_items = axis1_data.get("job_commitment_items", [0, 0, 0, 0, 0])
        p5 = min(20.0, sum(min(4.0, max(0.0, float(x))) for x in commitment_items[:5]))

        axis1_items = {
            "p1": p1,
            "p2": p2,
            "p3": p3,
            "p4": p4,
            "p5": p5
        }
        axis1_raw_total = min(100.0, p1 + p2 + p3 + p4 + p5)

    axis1_weighted = round(axis1_raw_total * 0.50, 2)

    # =========================================================================
    # المحور الثاني : النشاط العلمي والبحثي (30%)
    # =========================================================================
    axis2_data = data.get("axis2", {})
    
    # 1. البحوث في المستوعبات العالمية (Clarivate / Scopus) - القصوى 60
    global_research_score = min(60.0, float(axis2_data.get("global_research_score", 0)))
    
    # 2. البحوث المحلية والكتب المؤلفة - القصوى 25
    local_research_score = min(25.0, float(axis2_data.get("local_research_score", 0)))

    # 3. الإشراف على الطلبة والنشاطات العلمية الأخرى - القصوى 15
    supervision_score = min(15.0, float(axis2_data.get("supervision_score", 0)))

    axis2_items = {
        "p1": global_research_score,
        "p2": local_research_score,
        "p3": supervision_score
    }
    axis2_raw_total = min(100.0, global_research_score + local_research_score + supervision_score)
    axis2_weighted = round(axis2_raw_total * 0.30, 2)

    # =========================================================================
    # المحور الثالث : الجانب التربوي والإرشادي والتعليم المستمر (20%)
    # =========================================================================
    axis3_data = data.get("axis3", {})
    
    # 1. اللجان داخل الوزارة والجامعة - القصوى 30
    committees_score = min(30.0, float(axis3_data.get("committees_score", 0)))
    
    # 2. لجان التعليم المستمر والجودة - القصوى 20
    continuous_learning_score = min(20.0, float(axis3_data.get("continuous_learning_score", 0)))

    # 3. كتب الشكر والتقدير والشهادات التقديرية - القصوى 20
    thank_you_score = min(20.0, float(axis3_data.get("thank_you_score", 0)))

    # 4. الزيارات الميدانية والحقلية والأعمال التطوعية - القصوى 30
    field_visits_score = min(30.0, float(axis3_data.get("field_visits_score", 0)))

    axis3_items = {
        "p1": committees_score,
        "p2": continuous_learning_score,
        "p3": thank_you_score,
        "p4": field_visits_score
    }
    axis3_raw_total = min(100.0, committees_score + continuous_learning_score + thank_you_score + field_visits_score)
    axis3_weighted = round(axis3_raw_total * 0.20, 2)

    # =========================================================================
    # المحور الرابع : مواطن القوة (تضاف كحد أقصى 5 درجات)
    # =========================================================================
    axis4_data = data.get("axis4", {})
    strengths_items = axis4_data.get("items", {})
    strengths_raw_sum = sum(max(0.0, float(v)) for v in strengths_items.values())
    strengths_score = min(5.0, strengths_raw_sum)

    # =========================================================================
    # المحور الخامس : العقوبات (خصم الدرجات)
    # =========================================================================
    axis5_data = data.get("axis5", {})
    penalties_list = axis5_data.get("penalties", [])
    total_penalty_deduction = 0.0
    penalties_details = []

    for item in penalties_list:
        p_type = item.get("type")
        p_count = int(item.get("count", 1))
        if p_type in PENALTIES_MAP:
            ded = PENALTIES_MAP[p_type]["deduction"] * p_count
            total_penalty_deduction += ded
            penalties_details.append({
                "type": p_type,
                "name": PENALTIES_MAP[p_type]["name"],
                "count": p_count,
                "deduction": ded
            })

    # =========================================================================
    # احتساب المجموع والنتائج النهائية
    # =========================================================================
    three_axes_total = round(axis1_weighted + axis2_weighted + axis3_weighted, 2)
    score_with_strengths = min(100.0, round(three_axes_total + strengths_score, 2))

    # تطبيق شرط استمارة التقييم الوزارية الحاسم:
    # "في حال كون درجة الفقرة (المحور الثاني / 1) صفر، فإن درجة التقييم النهائية يجب أن لا تتجاوز 75"
    has_global_research = global_research_score > 0
    is_capped_at_75 = False
    if not has_global_research and score_with_strengths > 75.0:
        score_with_strengths = 75.0
        is_capped_at_75 = True
        warnings.append("تنبيه وزاري: نظراً لأن درجة النشر في المستوعبات العالمية (المحور الثاني/الفقرة 1) تساوي صفراً، فإن درجة التقييم النهائية لا تتجاوز 75 درجة وفق تعليمات الوزارة.")

    final_score = max(0.0, round(score_with_strengths - total_penalty_deduction, 2))

    if final_score >= 90.0:
        rating = "امتياز"
    elif final_score >= 80.0:
        rating = "جيد جدا"
    elif final_score >= 70.0:
        rating = "جيد"
    else:
        rating = "ضعيف"

    score_in_words = number_to_arabic_words(final_score)

    return {
        "is_non_teaching": is_non_teaching,
        "axis1": {
            "name": "جودة التدريس والتعليم والالتزام الوظيفي",
            "weight": 50,
            "items": axis1_items,
            "raw_total": axis1_raw_total,
            "weighted_score": axis1_weighted
        },
        "axis2": {
            "name": "النشاط العلمي والبحثي",
            "weight": 30,
            "items": axis2_items,
            "raw_total": axis2_raw_total,
            "weighted_score": axis2_weighted,
            "has_global_research": has_global_research
        },
        "axis3": {
            "name": "الجانب التربوي والإرشادي والتعليم المستمر",
            "weight": 20,
            "items": axis3_items,
            "raw_total": axis3_raw_total,
            "weighted_score": axis3_weighted
        },
        "axis4": {
            "name": "مواطن القوة",
            "raw_score": strengths_raw_sum,
            "awarded_score": strengths_score
        },
        "axis5": {
            "name": "العقوبات (خصم الدرجات)",
            "total_deduction": total_penalty_deduction,
            "details": penalties_details
        },
        "three_axes_total": three_axes_total,
        "score_with_strengths": score_with_strengths,
        "is_capped_at_75": is_capped_at_75,
        "final_score": final_score,
        "rating": rating,
        "score_in_words": score_in_words,
        "warnings": warnings
    }


# =============================================================================
# استمارة رقم (39): تقييم أداء أعضاء الهيئة التدريسية لمسار بولونيا 2025-2026
# =============================================================================

FORM39_PENALTIES_MAP = {
    "notice": {"name": "لفت نظر", "deduction": 3},
    "warning": {"name": "الإنذار", "deduction": 4},
    "salary_cut": {"name": "قطع الراتب", "deduction": 5},
    "reprimand": {"name": "التوبيخ", "deduction": 6},
    "salary_reduction": {"name": "إنقاص الراتب", "deduction": 7},
    "grade_demotion": {"name": "تنزيل الدرجة", "deduction": 8}
}

FORM39_RANK_MULTIPLIERS = {
    "أستاذ": 1.0,
    "أستاذ مساعد": 1.4,
    "مدرس": 1.6,
    "محاضر": 1.6,
    "مدرس مساعد": 1.8,
    "محاضر مساعد": 1.8
}


def calculate_evaluation_form39(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    احتساب درجات استمارة رقم (39) لمسار بولونيا للعام الدراسي 2025-2026
    وفق الضوابط الرسمية المعتمدة ومطابقة أوزان المحاور الأربعة (10%، 60%، 15%، 15%)
    """
    p_info = data.get("personal_info", {})
    academic_rank = p_info.get("academic_title", "أستاذ")
    rank_multiplier = FORM39_RANK_MULTIPLIERS.get(academic_rank, 1.0)
    warnings = []

    # =========================================================================
    # المحور الأول : تقييم الطالب للمادة الدراسية وطريقة التدريس (10 درجات - 10%)
    # =========================================================================
    ax1 = data.get("axis1_bologna", data.get("axis1", {}))
    
    # الفقرة 1: التدريس وفق مسار بولونيا (4 فقرات، درجة واحدة لكل فقرة، القصوى 4)
    p1_items = ax1.get("bologna_teaching_items", [0, 0, 0, 0])
    ax1_p1 = min(4.0, sum(min(1.0, max(0.0, float(x))) for x in p1_items[:4]))

    # الفقرة 2: كفاءة الأستاذ وطريقة التدريس (6 فقرات، درجة واحدة لكل فقرة، القصوى 6)
    p2_items = ax1.get("teaching_efficiency_items", [0, 0, 0, 0, 0, 0])
    ax1_p2 = min(6.0, sum(min(1.0, max(0.0, float(x))) for x in p2_items[:6]))

    axis1_total = round(ax1_p1 + ax1_p2, 2)
    axis1_weighted = axis1_total  # وزنه 10% والدرجة من 10

    # =========================================================================
    # المحور الثاني : تقييم حقيبة الأستاذ (60 درجة - 60%)
    # =========================================================================
    ax2 = data.get("axis2_portfolio", data.get("axis2", {}))

    # # 1: واجبات ومسؤوليات أعضاء هيئة التدريس (8 درجات)
    # أ) الحمل التدريسي / النصاب (القصوى 4)
    teaching_load_status = ax2.get("teaching_load_status", "none")
    if teaching_load_status in ["full", "partial_department_assigned"]:
        load_score = 4.0
    elif teaching_load_status == "partial":
        load_score = 2.0
    else:
        load_score = 0.0
    
    # ب) عضوية اللجان العلمية في القسم والكلية والجامعة والوزارة (القصوى 4)
    # 4 درجات لكل لجنة دائمية، 2 درجة لكل لجنة مؤقتة
    committees = ax2.get("committees", [])
    comm_score = 0.0
    for c in committees:
        c_type = c.get("type", "temporary")
        comm_score += 4.0 if c_type == "permanent" else 2.0
    comm_score = min(4.0, comm_score)
    p1_responsibilities = min(8.0, load_score + comm_score)

    # # 2: كفاءة التدريسي في تحقيق مهارات ومعارف وقيم معينة (5 درجات)
    # كتب الشكر والتقدير والجوائز الأكاديمية (القصوى 5)
    # 2 قسم، 3 كلية، 4 جامعة، 5 وزارة، 5 جائزة
    appreciation_items = ax2.get("appreciation_items", [])
    appreciation_score = 0.0
    for item in appreciation_items:
        a_type = item.get("type", "department")
        if a_type == "ministry" or a_type == "award":
            appreciation_score += 5.0
        elif a_type == "university":
            appreciation_score += 4.0
        elif a_type == "college":
            appreciation_score += 3.0
        else:
            appreciation_score += 2.0
    p2_skills = min(5.0, appreciation_score)

    # # 3: التدريب والتعليم المستمر (20 درجة)
    # أ) عقد الدورات التدريبية وورش العمل والندوات (القصوى 6)
    # دورة >= 24h: 4 درجات، ورشة عمل: 2، ندوة/سمينار: 2
    holding_events = ax2.get("holding_events", [])
    holding_score = 0.0
    for ev in holding_events:
        t = ev.get("type", "seminar")
        if t == "training_course_24h":
            holding_score += 4.0
        else:
            holding_score += 2.0
    holding_score = min(6.0, holding_score)

    # ب) حضور الدورات التدريبية أو المؤتمرات العلمية (القصوى 4)
    # حضور دورة: 2، مؤتمر بورقة: 2، مؤتمر بدون ورقة: 1
    attending_courses = ax2.get("attending_courses", [])
    attending_score = 0.0
    for ac in attending_courses:
        t = ac.get("type", "course")
        if t in ["course", "conf_paper"]:
            attending_score += 2.0
        else:
            attending_score += 1.0
    attending_score = min(4.0, attending_score)

    # ج) حضور الندوات العلمية - سمينار وورش العمل (القصوى 10)
    # درجة واحدة لكل حضور
    seminars_count = float(ax2.get("attending_seminars_count", len(ax2.get("attending_seminars", [])) if "attending_seminars" in ax2 else 0))
    seminars_score = min(10.0, seminars_count)

    p3_training = min(20.0, holding_score + attending_score + seminars_score)

    # # 4: رؤية الجامعة في البحث والتطوير ودعم القطاعات العلمية والصناعية (20 درجة)
    research_items = ax2.get("research_publications", [])
    research_raw = 0.0
    for r in research_items:
        cat = r.get("category", "scopus_q3")
        base_pts = 0.0
        if cat == "wipo_patent":
            base_pts = 20.0
        elif cat == "local_patent":
            base_pts = 5.0
        elif cat == "clarivate_scopus_high":
            base_pts = 12.0
        elif cat == "clarivate_scopus_mid":
            base_pts = 10.0
        elif cat == "clarivate_scopus_low":
            base_pts = 8.0
        elif cat == "scopus_book_1st":
            base_pts = 12.0
        elif cat == "scopus_book_2nd":
            base_pts = 8.0
        elif cat == "scopus_book_3rd":
            base_pts = 6.0
        elif cat == "scopus_chapter_1st":
            base_pts = 7.0
        elif cat == "scopus_chapter_2nd":
            base_pts = 4.0
        elif cat == "official_book":
            base_pts = 10.0
        elif cat == "scopus_q1":
            base_pts = 10.0
        elif cat == "scopus_q2":
            base_pts = 9.0
        elif cat == "scopus_q3":
            base_pts = 8.0
        elif cat == "scopus_q4":
            base_pts = 7.0
        elif cat == "non_indexed_doi":
            base_pts = 5.0
        else:
            base_pts = float(r.get("base_score", 8.0))

        # تعديلات تسلسل الباحث
        author_rank = r.get("author_rank", "first")
        if author_rank == "first":
            base_pts += 1.0
        elif author_rank == "corresponding":
            base_pts += 1.0
        elif author_rank == "rank_5_10":
            base_pts = max(0.0, base_pts - 2.0)
        elif author_rank == "rank_above_10":
            base_pts = base_pts * 0.5

        research_raw += base_pts

    # السقف الأقصى لتجميع درجات هذه الفقرة هو (20)
    research_capped_raw = min(20.0, research_raw)

    # يتم ضرب درجة هذه الفقرة بمعامل يعتمد على اللقب العلمي لعضو هيئة التدريس
    research_multiplied = round(research_capped_raw * rank_multiplier, 2)
    p4_research = min(20.0, research_multiplied)

    # # 5: النشاط الدولي (5 درجات)
    # أ) عضوية المؤسسات العلمية الدولية (القصوى 2)
    intl_org_type = ax2.get("intl_org_membership", "none")
    if intl_org_type == "senior_fellow":
        org_score = 2.0
    elif intl_org_type == "member":
        org_score = 1.0
    else:
        org_score = 0.0

    # ب) عضوية لجان تحرير المجلات وتقييم بحوثها (القصوى 4)
    editorial_items = ax2.get("editorial_items", [])
    edit_score = 0.0
    for ed in editorial_items:
        et = ed.get("type", "review_paper")
        if et == "clarivate_editor":
            edit_score += 4.0
        elif et == "scopus_editor":
            edit_score += 3.0
        elif et == "unindexed_editor":
            edit_score += 1.0
        else:  # review_paper
            edit_score += 1.0
    edit_score = min(4.0, edit_score)

    # ج) متحدث رئيسي في المؤتمرات الدولية (القصوى 2)
    keynote_type = ax2.get("keynote_speaker_type", "none")
    if keynote_type == "intl":
        keynote_score = 2.0
    elif keynote_type == "national":
        keynote_score = 1.0
    else:
        keynote_score = 0.0

    p5_intl = min(5.0, org_score + edit_score + keynote_score)

    # # 6: دعم إيرادات الجامعة (درجتان)
    fund_granted = bool(ax2.get("fund_granted", False))
    p6_revenue = 2.0 if fund_granted else 0.0

    axis2_total = min(60.0, round(p1_responsibilities + p2_skills + p3_training + p4_research + p5_intl + p6_revenue, 2))
    axis2_weighted = axis2_total  # وزنه 60% والدرجة من 60

    # =========================================================================
    # المحور الثالث : تقييم رئيس القسم للعملية التعليمية والأستاذ الجامعي (15 درجة - 15%)
    # =========================================================================
    ax3 = data.get("axis3_hod", data.get("axis3", {}))
    base_hod_score = float(ax3.get("base_score", 0.0))
    penalties_list = ax3.get("penalties", data.get("axis5", {}).get("penalties", []))
    
    total_penalty_deduction = 0.0
    penalties_details = []
    for item in penalties_list:
        p_type = item.get("type")
        p_count = int(item.get("count", 1))
        if p_type in FORM39_PENALTIES_MAP:
            ded = FORM39_PENALTIES_MAP[p_type]["deduction"] * p_count
            total_penalty_deduction += ded
            penalties_details.append({
                "type": p_type,
                "name": FORM39_PENALTIES_MAP[p_type]["name"],
                "count": p_count,
                "deduction": ded
            })

    axis3_total = max(0.0, round(min(15.0, base_hod_score) - total_penalty_deduction, 2))
    axis3_weighted = axis3_total  # وزنه 15% والدرجة من 15

    # =========================================================================
    # المحور الرابع : الجانب التربوي والإرشادي (15 درجة - 15%)
    # =========================================================================
    ax4 = data.get("axis4_guidance", data.get("axis4", {}))
    
    # 1. المشاركة في لجان التعليم المستمر والجودة (القصوى 5)
    qa_items = ax4.get("qa_committee_items", [])
    qa_score = 0.0
    for q in qa_items:
        qt = q.get("type", "methods")
        if qt == "lecturer":
            qa_score += 5.0
        elif qt == "attendee":
            qa_score += 4.0
        else:
            qa_score += 3.0
    p1_qa = min(5.0, qa_score if qa_items else float(ax4.get("qa_score", 0.0)))

    # 4. الزيارات الميدانية والحقلية والأعمال التطوعية (القصوى 10)
    field_items = ax4.get("field_activities", [])
    field_score = 0.0
    for f in field_items:
        ft = f.get("type", "community_activity")
        if ft == "field_supervision":
            field_score += 10.0
        elif ft == "volunteer_work_ministry":
            field_score += 5.0
        else:  # community / outside ministry
            field_score += 5.0
    p2_field = min(10.0, field_score if field_items else float(ax4.get("field_score", 0.0)))

    axis4_total = min(15.0, round(p1_qa + p2_field, 2))
    axis4_weighted = axis4_total  # وزنه 15% والدرجة من 15

    # =========================================================================
    # المجموع النهائي والتقدير والتفقيط
    # =========================================================================
    final_score = min(100.0, max(0.0, round(axis1_weighted + axis2_weighted + axis3_weighted + axis4_weighted, 2)))

    if final_score >= 90.0:
        rating = "امتياز"
    elif final_score >= 80.0:
        rating = "جيد جدا"
    elif final_score >= 70.0:
        rating = "جيد"
    else:
        rating = "ضعيف"

    score_in_words = number_to_arabic_words(final_score)

    return {
        "form_type": "form39",
        "academic_rank": academic_rank,
        "rank_multiplier": rank_multiplier,
        "axis1": {
            "name": "تقييم الطالب للمادة الدراسية وطريقة التدريس",
            "weight": 10,
            "items": {"p1_bologna": ax1_p1, "p2_efficiency": ax1_p2},
            "total_score": axis1_total,
            "weighted_score": axis1_weighted
        },
        "axis2": {
            "name": "تقييم حقيبة الأستاذ",
            "weight": 60,
            "items": {
                "p1_responsibilities": p1_responsibilities,
                "p2_skills": p2_skills,
                "p3_training": p3_training,
                "p4_research": p4_research,
                "p4_research_raw": research_capped_raw,
                "p4_research_multiplied": research_multiplied,
                "p5_intl": p5_intl,
                "p6_revenue": p6_revenue
            },
            "total_score": axis2_total,
            "weighted_score": axis2_weighted
        },
        "axis3": {
            "name": "تقييم رئيس القسم للعملية التعليمية والأستاذ الجامعي",
            "weight": 15,
            "base_score": base_hod_score,
            "total_deduction": total_penalty_deduction,
            "penalties_details": penalties_details,
            "total_score": axis3_total,
            "weighted_score": axis3_weighted
        },
        "axis4": {
            "name": "الجانب التربوي والإرشادي",
            "weight": 15,
            "items": {"p1_qa": p1_qa, "p2_field": p2_field},
            "total_score": axis4_total,
            "weighted_score": axis4_weighted
        },
        "final_score": final_score,
        "rating": rating,
        "score_in_words": score_in_words,
        "warnings": warnings
    }
