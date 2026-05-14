from django import forms
from .models import Course, Module, Lesson

class CourseForm(forms.ModelForm):
    class Meta:
        model = Course
        fields = ["title", "objective", "description"]

class ModuleForm(forms.ModelForm):
    class Meta:
        model = Module
        fields = ["title", "description", "order"]

class LessonForm(forms.ModelForm):
    class Meta:
        model = Lesson
        fields = ["title", "content", "order"]
