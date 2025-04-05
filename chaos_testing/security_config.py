from typing import Dict, List

# Allowed chaos actions with resource limits
ALLOWED_ACTIONS: Dict[str, List[str]] = {
    "network": ["latency", "loss", "duplication", "corruption"],
    "system": ["cpu", "memory", "disk", "process"],
    "time": ["jitter", "drift"],
    "k8s": ["pod-failure", "container-kill"]
}

# Resource limits per test
RESOURCE_LIMITS = {
    "cpu": 2,          # Max CPU cores
    "memory": 8192,    # Max memory in MB
    "timeout": 600,    # Max runtime in seconds
    "disk": 1024       # Max disk space in MB
}

# Security thresholds
SECURITY_THRESHOLDS = {
    "max_network_delay": 5000,   # Max network delay in ms
    "max_cpu_load": 90,          # Max CPU load percentage
    "max_memory_usage": 80       # Max memory usage percentage
}
