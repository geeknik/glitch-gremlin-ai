import modal
from modal import Image, Mount, Secret, Sandbox
import json
import re
from typing import Dict, List
from pathlib import Path

# Security configuration
ALLOWED_ACTIONS = {
    "network": ["latency", "loss", "duplication"],
    "system": ["cpu", "memory", "disk"],
    "time": ["jitter", "drift"]
}

# Define custom chaos testing image
chaos_image = Image.debian_slim().apt_install(
    "iproute2",  # For network chaos
    "stress-ng",  # For system stress tests
    "tc"         # Traffic control
).pip_install(
    "chaostoolkit",
    "chaostoolkit-kubernetes",
    "chaostoolkit-reporting"
)

app = modal.App("glitch-gremlin-chaos")

@app.function(
    image=chaos_image,
    secrets=[Secret.from_name("chaos-env-vars")],
    mounts=[Mount.from_local_dir("./chaos_experiments", remote_path="/experiments")]
)
def run_chaos_test(experiment_file: str, timeout: int = 300) -> Dict:
    """Execute a chaos test in an isolated sandbox with security constraints"""
    experiment_path = Path(f"/experiments/{experiment_file}")
    if not experiment_path.suffix == ".json":
        raise ValueError("Only JSON experiment files are allowed")

    with Sandbox.create(
        app=app,
        command=["chaos", "run", str(experiment_path)],
        timeout=timeout,
        workdir="/experiments",
        cpu=2,
        memory=8192
    ) as sb:
        result = monitor_sandbox(sb)
        result["artifacts"] = list_sandbox_artifacts(sb)
        return result

def list_sandbox_artifacts(sb: Sandbox) -> List[str]:
    """Collect generated artifacts from sandbox"""
    return sb.exec("find", "/experiments", "-name", "*.json").stdout.read().splitlines()

@app.function
def parallel_chaos_run(experiment_files: List[str]) -> List[Dict]:
    """Execute multiple chaos tests in parallel with resource limits"""
    return modal.map(
        lambda f: run_chaos_test(f, timeout=600),
        experiment_files,
        return_exceptions=True
    )

def validate_experiment(config: Dict) -> bool:
    """Ensure experiment meets security requirements"""
    if not isinstance(config, dict):
        return False
        
    for action in config.get("actions", []):
        category, method = action.get("type", "").split(":")
        if category not in ALLOWED_ACTIONS or method not in ALLOWED_ACTIONS[category]:
            return False
    return True

def monitor_sandbox(sb: Sandbox) -> Dict:
    """Monitor sandbox execution with security constraints"""
    result = {"status": "running", "events": []}
    
    try:
        for line in sb.stdout:
            event = parse_chaos_event(line)
            result["events"].append(event)
            
            if detect_malicious_activity(event):
                sb.terminate()
                result["status"] = "terminated"
                break
                
        result.update({
            "exit_code": sb.exit_code,
            "logs": sb.stdout.read()
        })
    except modal.exception.TimeoutError:
        result["status"] = "timeout"
        
    return result

def parse_chaos_event(log_line: str) -> Dict:
    """Parse structured log events from chaos toolkit"""
    try:
        return json.loads(log_line)
    except json.JSONDecodeError:
        return {"message": log_line.strip()}

def detect_malicious_activity(event: Dict) -> bool:
    """Heuristic analysis of chaos events for security violations"""
    suspicious_patterns = {
        "unauthorized_access": r"permission denied|access denied",
        "resource_exhaustion": r"OOM|out of memory|ENOMEM",
        "shell_injection": r"sh -c|bash -c|&&|\|\|"
    }
    
    message = event.get("message", "").lower()
    return any(
        re.search(pattern, message)
        for pattern in suspicious_patterns.values()
    )
