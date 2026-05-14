from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from .models import Course, Module, Lesson
from .forms import CourseForm, ModuleForm, LessonForm
from django.views.decorators.http import require_http_methods
from .utils.openai_gen import generate_course_from_prompt


@login_required
def course_list(request):
    courses = Course.objects.filter(created_by=request.user).order_by("title")
    return render(request, "courses/course_list.html", {"courses": courses})

@login_required
def course_detail(request, pk):
    course = get_object_or_404(Course, pk=pk, created_by=request.user)
    modules = course.modules.all().prefetch_related("lessons")
    return render(request, "courses/course_detail.html", {"course": course, "modules": modules})

@login_required
def create_course(request):
    if request.method == "POST":
        form = CourseForm(request.POST)
        if form.is_valid():
            course = form.save(commit=False)
            course.created_by = request.user
            course.save()
            messages.success(request, "Course created.")
            return redirect("courses:course_detail", pk=course.pk)
    else:
        form = CourseForm()
    return render(request, "courses/course_form.html", {"form": form})

@login_required
def create_module(request, course_id):
    course = get_object_or_404(Course, pk=course_id, created_by=request.user)
    if request.method == "POST":
        form = ModuleForm(request.POST)
        if form.is_valid():
            module = form.save(commit=False)
            module.course = course
            module.save()
            messages.success(request, "Module added.")
            return redirect("courses:course_detail", pk=course.pk)
    else:
        form = ModuleForm()
    return render(request, "courses/module_form.html", {"form": form, "course": course})

@login_required
def add_lesson(request, module_id):
    module = get_object_or_404(Module, pk=module_id, course__created_by=request.user)
    if request.method == "POST":
        form = LessonForm(request.POST)
        if form.is_valid():
            lesson = form.save(commit=False)
            lesson.module = module
            lesson.save()
            messages.success(request, "Lesson added.")
            return redirect("courses:course_detail", pk=module.course.pk)
    else:
        form = LessonForm()
    return render(request, "courses/lesson_form.html", {"form": form, "module": module})

@login_required
def profile(request):
    return render(request, "courses/profile.html")

@login_required
@require_http_methods(["GET", "POST"])
def generate_course_view(request):
    if request.method == "POST":
        prompt = (request.POST.get("prompt") or "").strip()
        if not prompt:
            messages.error(request, "Please enter a prompt.")
            return redirect("courses:generate_course")
        try:
            course = generate_course_from_prompt(prompt, request.user)
            messages.success(request, f"Generated course: {course.title}")
            return redirect("courses:course_detail", pk=course.pk)
        except Exception as e:
            messages.error(request, f"Generation failed: {e}")
            return redirect("courses:generate_course")
    return render(request, "courses/generate_course.html")

from django.http import FileResponse, Http404
from .utils.asciidoc import write_course_adoc

@login_required
def export_course_adoc_view(request, pk: int):
    course = get_object_or_404(Course, pk=pk, created_by=request.user)
    path = write_course_adoc(course)
    if not path.exists():
        raise Http404("Export failed.")
    return FileResponse(open(path, "rb"), as_attachment=True, filename=path.name)
