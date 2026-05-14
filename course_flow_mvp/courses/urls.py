from django.urls import path
from . import views

app_name = "courses"

urlpatterns = [
    path("", views.course_list, name="course_list"),
    path("course/<int:pk>/", views.course_detail, name="course_detail"),
    path("course/create/", views.create_course, name="create_course"),
    path("module/create/<int:course_id>/", views.create_module, name="create_module"),
    path("lesson/add/<int:module_id>/", views.add_lesson, name="add_lesson"),
    path("profile/", views.profile, name="profile"),
    path("generate/", views.generate_course_view, name="generate_course"),
    path("export/<int:pk>/adoc/", views.export_course_adoc_view, name="export_course_adoc"),

]


