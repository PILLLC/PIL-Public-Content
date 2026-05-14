# course_flow/branding.py
import os

def brand(request):
    return {
        "BRAND_NAME": os.getenv("BRAND_NAME", "Public Information Limited"),
        "BRAND_PRODUCT": os.getenv("BRAND_PRODUCT", "Course Flow"),
        "BRAND_SHORT": os.getenv("BRAND_SHORT", "PIL"),
        "BRAND_URL": os.getenv("BRAND_URL", "/"),
    }
