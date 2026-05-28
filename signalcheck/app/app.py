import os
import json
from datetime import datetime
from flask import (
    Flask,
    render_template,
    send_from_directory,
    jsonify,
    request,
    make_response,
    render_template_string,
)

app = Flask(__name__, static_folder='assets', template_folder='.')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CASES_DIR = os.path.join(BASE_DIR, 'cases')
SCENARIO_DIR = os.path.join(BASE_DIR, 'scenario')
SCENARIOS_DIR = os.path.join(BASE_DIR, 'scenarios')


def get_scenario_dir():
    if os.path.isdir(SCENARIO_DIR):
        return SCENARIO_DIR
    if os.path.isdir(SCENARIOS_DIR):
        return SCENARIOS_DIR
    return SCENARIO_DIR


def safe_str(value, default='n/a'):
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def format_step_selected(selected):
    if isinstance(selected, list):
        return ", ".join(str(x) for x in selected) if selected else "No answer"
    return safe_str(selected, "No answer")


def format_step_style(style):
    if isinstance(style, list):
        return ", ".join(str(x) for x in style) if style else "n/a"
    return safe_str(style, "n/a")


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/assets/<path:filename>')
def assets(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'assets'), filename)


@app.route('/cases/<path:filename>')
def cases(filename):
    return send_from_directory(CASES_DIR, filename)


@app.route('/scenario/<path:filename>')
@app.route('/scenarios/<path:filename>')
def scenario_file(filename):
    scenario_dir = get_scenario_dir()
    return send_from_directory(scenario_dir, filename)


@app.route('/api/cases')
def list_cases():
    if not os.path.isdir(CASES_DIR):
        return jsonify([])

    case_files = sorted(
        [f for f in os.listdir(CASES_DIR) if f.endswith('.json')]
    )
    return jsonify(case_files)


@app.route('/api/scenarios')
def list_scenarios():
    scenario_dir = get_scenario_dir()

    if not os.path.isdir(scenario_dir):
        return jsonify([])

    scenario_files = sorted(
        [f for f in os.listdir(scenario_dir) if f.endswith('.json')]
    )
    return jsonify(scenario_files)


@app.route('/export/session.adoc', methods=['POST'])
def export_adoc():
    session = request.get_json() or {}

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    scenario = session.get('scenario', {}) or {}
    scenario_title = safe_str(scenario.get('title'))
    scenario_id = safe_str(scenario.get('id'))
    scenario_role = safe_str(scenario.get('role'))
    scenario_difficulty = safe_str(scenario.get('difficulty'))

    score = session.get('score', 0)
    total = session.get('total', 0)
    performance = safe_str(session.get('performance'))
    outcome = safe_str(session.get('outcome'))
    outcome_score = safe_str(session.get('outcomeScore'))
    dominant_style = safe_str(session.get('dominantStyle'))

    style_counts = session.get('styleCounts', {}) or {}
    scenario_state = session.get('scenarioState', {}) or {}
    results = session.get('results', []) or []
    incident_feed = session.get('incidentFeed', []) or []

    adoc_lines = [
        "= SignalCheck Session Summary",
        f":session-date: {timestamp}",
        "",
        "== Scenario Overview",
        "",
        f"* Title: {scenario_title}",
        f"* ID: {scenario_id}",
        f"* Role: {scenario_role}",
        f"* Difficulty: {scenario_difficulty}",
        "",
        "== Performance Summary",
        "",
        f"* Score: {score} / {total}",
        f"* Performance: {performance}",
        f"* Outcome: {outcome}",
        f"* Outcome Score: {outcome_score} / 100",
        f"* Dominant Style: {dominant_style}",
        "",
        "== Incident State Summary",
        "",
    ]

    if scenario_state:
        for key, value in scenario_state.items():
            label = key.replace('_', ' ').title()
            adoc_lines.append(f"* {label}: {value}")
    else:
        adoc_lines.append("* No state data available.")

    adoc_lines.extend([
        "",
        "== Decision Style Breakdown",
        ""
    ])

    if style_counts:
        for style, count in style_counts.items():
            adoc_lines.append(f"* {style}: {count}")
    else:
        adoc_lines.append("* n/a")

    adoc_lines.extend([
        "",
        "== Active Incident Feed",
        ""
    ])

    if incident_feed:
        for entry in incident_feed:
            feed_time = safe_str(entry.get('timestamp'), '')
            message = safe_str(entry.get('message'), '')
            entry_type = safe_str(entry.get('type'), 'info')
            adoc_lines.append(f"* [{feed_time}] ({entry_type}) {message}")
    else:
        adoc_lines.append("* No incident feed entries recorded.")

    adoc_lines.extend([
        "",
        "== Case Review",
        ""
    ])

    if results:
        for r in results:
            selected_text = format_step_selected(r.get('selected'))
            style_text = format_step_style(r.get('style'))
            correctness = '✅' if r.get('correct') else '❌'

            adoc_lines.append(
                f"=== Step {safe_str(r.get('step_number'))}: {safe_str(r.get('case'), 'Untitled')}"
            )
            adoc_lines.append(f"* Your Choice: {selected_text} {correctness}")
            adoc_lines.append(f"* Style: {style_text}")
            adoc_lines.append(f"* Feedback: {safe_str(r.get('feedback'), 'No feedback.')}")
            adoc_lines.append(f"* Consequence: {safe_str(r.get('consequence'), 'No consequence provided.')}")
            adoc_lines.append(f"* Next Step: {safe_str(r.get('next_step'), 'End of scenario')}")
            adoc_lines.append("")
    else:
        adoc_lines.append("* No case results recorded.")
        adoc_lines.append("")

    adoc_text = "\n".join(adoc_lines)

    response = make_response(adoc_text)
    response.headers.set('Content-Type', 'text/plain; charset=utf-8')
    response.headers.set('Content-Disposition', 'attachment', filename='signalcheck_session.adoc')
    return response


@app.route('/editor')
def editor():
    with open(os.path.join(BASE_DIR, 'editor.html'), 'r', encoding='utf-8') as f:
        return render_template_string(f.read())


@app.route('/leaderboard')
def leaderboard():
    with open(os.path.join(BASE_DIR, 'leaderboard.html'), 'r', encoding='utf-8') as f:
        return render_template_string(f.read())


@app.route('/api/save_case', methods=['POST'])
def save_case():
    if not os.path.isdir(CASES_DIR):
        os.makedirs(CASES_DIR, exist_ok=True)

    data = request.get_json() or {}
    case_id = data.get("id", f"case{len(os.listdir(CASES_DIR)) + 1}")
    filename = f"{case_id}.json"
    filepath = os.path.join(CASES_DIR, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    return jsonify({"status": "success", "file": filename})


@app.route('/admin')
def admin_dashboard():
    if not os.path.isdir(CASES_DIR):
        cases_data = []
    else:
        files = [f for f in os.listdir(CASES_DIR) if f.endswith('.json')]
        cases_data = []

        for filename in files:
            filepath = os.path.join(CASES_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    cases_data.append({
                        "id": data.get("id", filename),
                        "title": data.get("title", "Untitled"),
                        "filename": filename
                    })
            except (json.JSONDecodeError, OSError):
                cases_data.append({
                    "id": filename,
                    "title": "Invalid JSON",
                    "filename": filename
                })

    with open(os.path.join(BASE_DIR, 'admin.html'), 'r', encoding='utf-8') as f:
        return render_template_string(f.read(), cases=cases_data)


@app.route('/api/delete_case/<filename>', methods=['DELETE'])
def delete_case(filename):
    path = os.path.join(CASES_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
        return jsonify({"status": "deleted", "file": filename})
    return jsonify({"status": "not found"}), 404


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)