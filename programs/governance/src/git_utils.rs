use std::process::Command;
use std::io::{self, Write};

pub fn pull_with_rebase() -> io::Result<()> {
    println!("Pulling latest changes with rebase...");
    
    let output = Command::new("git")
        .args(["pull", "--rebase", "origin", "main"])
        .output()?;
    
    io::stdout().write_all(&output.stdout)?;
    io::stderr().write_all(&output.stderr)?;
    
    if output.status.success() {
        println!("Successfully pulled and rebased!");
    } else {
        println!("Rebase encountered issues. You may need to resolve conflicts.");
    }
    
    Ok(())
}

pub fn continue_rebase() -> io::Result<()> {
    println!("Continuing rebase after conflict resolution...");
    
    let output = Command::new("git")
        .args(["rebase", "--continue"])
        .output()?;
    
    io::stdout().write_all(&output.stdout)?;
    io::stderr().write_all(&output.stderr)?;
    
    if output.status.success() {
        println!("Rebase continued successfully!");
    } else {
        println!("Rebase continue failed. Check for remaining conflicts.");
    }
    
    Ok(())
}

pub fn push_changes(force: bool) -> io::Result<()> {
    let mut args = vec!["push", "origin", "main"];
    
    if force {
        println!("Force pushing changes (use with caution)...");
        args.push("-f");
    } else {
        println!("Pushing changes...");
    }
    
    let output = Command::new("git")
        .args(args)
        .output()?;
    
    io::stdout().write_all(&output.stdout)?;
    io::stderr().write_all(&output.stderr)?;
    
    if output.status.success() {
        println!("Successfully pushed changes!");
    } else {
        println!("Push failed. You might need to pull first or use force push.");
    }
    
    Ok(())
}

pub fn check_status() -> io::Result<()> {
    println!("Checking git status...");
    
    let output = Command::new("git")
        .arg("status")
        .output()?;
    
    io::stdout().write_all(&output.stdout)?;
    
    Ok(())
}
