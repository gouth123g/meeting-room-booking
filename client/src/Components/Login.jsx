import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  // ⭐ ONLY ADDED THIS STYLE ⭐
  const pageStyle = {
    minHeight: "100vh",
    width: "100%",
    backgroundImage: "url('/login-bg.jpg')", // from public folder
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (email === "admin@site.com" && password === "admin123") {
      navigate("/admin");
    } else if (email === "user@site.com" && password === "user123") {
      navigate("/user");
    }
     else if(email === "user1@site.com" && password === "user1234"){
            navigate("/user")
     } else {
      alert("Invalid credentials");
    }
  };

  return (
    // ⭐ ONLY WRAPPED YOUR ORIGINAL LOGIN FORM ⭐
    <div style={pageStyle}>
      <div
        style={{
          width: "300px",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          textAlign: "center",
          background: "rgba(255,255,255,0.85)", // keeps your form readable
        }}
      >
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: "8px", marginBottom: "10px" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: "8px", marginBottom: "10px" }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              marginTop: "10px",
              cursor: "pointer",
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
