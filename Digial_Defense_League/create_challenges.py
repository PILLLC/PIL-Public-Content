import requests

# Configuration
BASE_URL = "http://localhost:8000"
API_KEY = "ctfd_d6044d239c2da4b1670ee14a35695e7d729fb7a3b45c09f10818691cd1b30c08"  # Replace with your admin API key

# Challenges Data
challenges = [
    {
        "name": "Decode the Message",
        "category": "Cryptography",
        "description": "Decode this message: `Uryyb Jbeyq!` Hint: It's a simple cipher.",
        "value": 100,
        "type": "standard",
        "flag": "flag{HelloWorld}",
    },
    {
        "name": "Hidden in Plain Sight",
        "category": "Web Exploitation",
        "description": "Visit this [link](http://localhost:8000/challenges/hidden-flag) and find the hidden flag. Hint: Inspect the source code of the webpage.",
        "value": 100,
        "type": "standard",
        "flag": "flag{source_code_reveals_all}",
    },
    {
        "name": "Simple SQL Injection",
        "category": "Web Exploitation",
        "description": "Find the admin's password using SQL injection on this login page.",
        "value": 200,
        "type": "standard",
        "flag": "flag{sql_injection_successful}",
    },
    {
        "name": "Reverse the String",
        "category": "Reversing",
        "description": "Reverse this encoded message: `!dlroW ,olleH`. Hint: Read it backward.",
        "value": 100,
        "type": "standard",
        "flag": "flag{HelloWorld}",
    },
    {
        "name": "Basic Math",
        "category": "Miscellaneous",
        "description": "Solve this math problem: What is 123 + 456?",
        "value": 50,
        "type": "standard",
        "flag": "flag{579}",
    },
    {
        "name": "File Analysis",
        "category": "Forensics",
        "description": "Analyze the attached file to find the hidden flag.",
        "value": 150,
        "type": "standard",
        "flag": "flag{file_analysis_done}",
    },
    {
        "name": "Hash Cracking",
        "category": "Cryptography",
        "description": "Crack this hash: `5d41402abc4b2a76b9719d911017c592`. Hint: It's a common word.",
        "value": 200,
        "type": "standard",
        "flag": "flag{hello}",
    },
    {
        "name": "Basic Enumeration",
        "category": "Recon",
        "description": "Enumerate the services on this server to find the open port.",
        "value": 150,
        "type": "standard",
        "flag": "flag{open_port_22}",
    },
    {
        "name": "Simple Brute Force",
        "category": "Cracking",
        "description": "Brute force the password on this login page.",
        "value": 200,
        "type": "standard",
        "flag": "flag{bruteforce_successful}",
    },
    {
        "name": "Find the Secret",
        "category": "Steganography",
        "description": "Decode the secret hidden in this image file.",
        "value": 250,
        "type": "standard",
        "flag": "flag{stego_success}",
    },
]

# Function to create a challenge
def create_challenge(base_url, api_key, challenge):
    url = f"{base_url}/api/v1/challenges"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "name": challenge["name"],
        "category": challenge["category"],
        "description": challenge["description"],
        "value": challenge["value"],
        "type": challenge["type"],
        "state": "visible",
    }
    response = requests.post(url, json=data, headers=headers)
    if response.status_code == 200:
        challenge_id = response.json()["data"]["id"]
        create_flag(base_url, api_key, challenge_id, challenge["flag"])
        print(f"Created challenge: {challenge['name']}")
    else:
        print(f"Failed to create challenge: {challenge['name']}")
        print(response.text)

# Function to create a flag for a challenge
def create_flag(base_url, api_key, challenge_id, flag):
    url = f"{base_url}/api/v1/flags"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "challenge_id": challenge_id,
        "type": "static",
        "content": flag,
        "data": "",
    }
    response = requests.post(url, json=data, headers=headers)
    if response.status_code == 200:
        print(f"Flag created for challenge ID {challenge_id}")
    else:
        print(f"Failed to create flag for challenge ID {challenge_id}")
        print(response.text)

# Main function
if __name__ == "__main__":
    for challenge in challenges:
        create_challenge(BASE_URL, API_KEY, challenge)
