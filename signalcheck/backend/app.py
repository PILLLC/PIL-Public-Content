from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='../sandbox', template_folder='../sandbox')

@app.route('/')
def index():
    return send_from_directory('../sandbox', 'index.html')

@app.route('/assets/<path:filename>')
def assets(filename):
    return send_from_directory('../sandbox/assets', filename)

@app.route('/cases/<path:filename>')
def cases(filename):
    return send_from_directory('../sandbox/cases', filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
