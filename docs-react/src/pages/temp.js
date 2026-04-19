import {useState} from "react";
import api from "../Auth/axios";
import './User.css'
import {Link , useNavigate} from 'react-router-dom'

export default function SignUp(){
    const navigate = useNavigate()
    const [data , Setdata] = useState({
        name :"",
        gender : "",
        email : "" ,
        age : "",
        address : "",
        password : "",
    })

    const handlsignup = async() =>{
        try{
            const res = await api.post('/create_user' , data);
            console.log(res.data)
            alert("Signup successfull")
            navigate('/login')
        } catch(err){
            console.log(err)
            alert("signup unsuccessfull")
        }
    };
    
    return (
      <section>
          <div className="auth-shell">
              <div className="hero-panel hidden-mobile">
                  <div>
                      <span className="eyebrow">Create Your Flow</span>
                      <h1>Build docs that feel live, social, and actually fun to use.</h1>
                      <p>
                          Sign up once and you get your own dashboard, collaborative docs, live sessions,
                          and AI-assisted writing in one bold workspace.
                      </p>
                      <div className="hero-grid">
                          <div className="hero-card">
                              <strong>Personal dashboard</strong>
                              <span>Track every document you create, join, or keep editing later.</span>
                          </div>
                          <div className="hero-card">
                              <strong>Instant room sharing</strong>
                              <span>Create a doc and turn it into a shareable live session whenever you want.</span>
                          </div>
                          <div className="hero-card">
                              <strong>Clean editor</strong>
                              <span>Rich writing tools, live sync, and smart hints without clutter.</span>
                          </div>
                      </div>
                  </div>
                  <div className="hero-metrics">
                      <div className="metric-pill"><b>Docs</b> that stay editable</div>
                      <div className="metric-pill"><b>Join code</b> access</div>
                      <div className="metric-pill"><b>Owner</b> control flow</div>
                  </div>
              </div>

              <div className="login">
                    <span className="eyebrow">Start Here</span>
                    <h1>Sign Up</h1>
                    <p className="auth-subtitle">
                        Set up your profile and unlock your full Your Docs workspace.
                    </p>

                    <div className="form-grid">
                        <div className="inputBox">
                            <input type="text" className="text" placeholder="Name" 
                                onChange={(e) => Setdata({...data , name : e.target.value})}
                            />
                        </div>

                        <div className="inputBox">
                             <input type="text" className="text" placeholder="Gender" 
                                onChange={(e) => Setdata({...data , gender : e.target.value})}
                            />
                        </div>
                        <div className="inputBox full">
                             <input type="email" className="email" placeholder="Email" 
                                onChange={(e) => Setdata({...data , email : e.target.value})}
                            />
                        </div>
                        <div className="inputBox">
                             <input type="number" className="number" placeholder="Age" 
                                onChange={(e) => Setdata({...data , age : e.target.value})}
                            />
                        </div>
                        <div className="inputBox">
                            <input type="text" className="text" placeholder="Address" 
                                onChange={(e) => Setdata({...data , address : e.target.value})}
                            />
                        </div>
                        <div className="inputBox full">
                            <input type="password" className="password" placeholder="Password" 
                                onChange={(e) => Setdata({...data , password : e.target.value})}
                            />
                        </div>
                    </div>

                    <button className="btn" onClick={handlsignup}>Create Account</button>
                    <div className="auth-link">
                        <span>Already have Account?</span>
                        <Link to="/login">Login</Link>
                    </div>
              </div>
          </div>
      </section>

    )
}
