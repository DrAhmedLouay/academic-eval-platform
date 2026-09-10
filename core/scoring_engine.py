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
    احتساب كافة درجات الاستمارة والمحاور الخمسة وتطبيق الأوزان والشروط الوزارية
    """
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
