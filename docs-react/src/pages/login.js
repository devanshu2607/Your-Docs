import { useState , useRef} from "react";
import './User.css';
import api from '../Auth/axios'
import {Link , useNavigate} from "react-router-dom"



export default function Login(){
    const navigate = useNavigate()
    const passref = useRef();
    const [error, setError] = useState("");
    const [data , setData] = useState({
        username : "",
        password : ""
    });

    const handlelogin = async() => { 
        
        try{
            const formData = new URLSearchParams() ;

            formData.append("username" , data.username);
            formData.append("password" , data.password);

            const res = await api.post('login_user' , formData)
            console.log(res.data)
            localStorage.setItem("token" , res.data.access_token)
            navigate('/dashboard');
            alert ("login successful")
        }catch(err){
            console.log(err.response?.data)

            const message = err.response?.data?.detail;

            if(message === "user Not registered"){
                alert("User not register")
                navigate('/')
            }
            else if(message === "password doest not match"){
                alert("Password does not match")
                setData({ ...data , password : ""});
                setError("Password is wrong")
                passref.current.focus();
            }
            else {
                setError("something went wrong")
            }
        }
    };

    return (
        <section>
            <div className="auth-shell">
                <div className="hero-panel hidden-mobile">
                    <div>
                        <span className="eyebrow">Live Writing Space</span>
                        <h1>Write fast. Sync faster. Look dangerously cool doing it.</h1>
                        <p>
                            Your Docs lets you jump from solo drafting to live collaboration with share codes,
                            real-time updates, and AI word suggestions inside the same editor.
                        </p>
                        <div className="hero-grid">
                            <div className="hero-card">
                                <strong>Live session</strong>
                                <span>Start a room, share the code, and co-edit without the boring workflow.</span>
                            </div>
                            <div className="hero-card">
                                <strong>Smart suggestion</strong>
                                <span>NLP-powered next-word hints appear while you write and stay out of your way.</span>
                            </div>
                            <div className="hero-card">
                                <strong>Fast control</strong>
                                <span>Create, edit, save, join, and manage docs from one clean dashboard.</span>
                            </div>
                        </div>
                    </div>
                    <div className="hero-metrics">
                        <div className="metric-pill"><b>Real-time</b> collaboration</div>
                        <div className="metric-pill"><b>Share code</b> based join flow</div>
                        <div className="metric-pill"><b>AI hint</b> with tab accept</div>
                    </div>
                </div>

                <div className="login">
                    <span className="eyebrow">Welcome Back</span>
                    <h1>Login</h1>
                    <p className="auth-subtitle">
                        Jump back into your dashboard, continue your docs, and start a live room in seconds.
                    </p>

                    <div className="inputBox">
                        <input
                            type="email"
                            className="email"
                            placeholder="Email"
                            value={data.username}
                            onChange={(e) => setData({...data , username : e.target.value})}
                        />
                    </div>

                    <div className="inputBox">
                         <input
                            type="password"
                            className="password"
                            placeholder="Password"
                            ref={passref}
                            value={data.password}
                            onChange={(e) => setData({...data , password : e.target.value})}
                        />
                    </div>

                    <div className="btn" onClick={handlelogin}>Enter Workspace</div>
                    {error && <p className="error-text">{error}</p>}

                    <div className="auth-link">
                        <span>Don't have an account?</span>
                        <Link to="/">Signup</Link>
                    </div>
                </div>
            </div>
        </section>
    )
}
