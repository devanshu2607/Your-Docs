from pydantic import BaseModel , Field , field_validator , EmailStr
from typing import Annotated , Literal
from uuid import UUID

class User_SignUp(BaseModel):
    name : Annotated[str , Field(..., description="enter your name")]
    gender : Annotated[Literal['male','female','other'] , Field(...,description='enter your gender')]
    email : Annotated[EmailStr , Field(..., description="enter your email")]
    age : Annotated[int , Field(..., gt=0 ,description="enter your age")]
    address : Annotated[str , Field(..., description="enter your address")]
    password : Annotated[str , Field(..., description="enter your password")]

    @field_validator("email")
    @classmethod
    def check_email(cls , value):
        split_value = value.split('@')[-1]

        check_domain = ['gmail.com','yahoo.com']

        if split_value not in check_domain:
            raise ValueError("enter correct and valid email domain")
        return value
    
class User_Login(BaseModel):
    email : Annotated[EmailStr , Field(..., description="enter your email")]
    password : Annotated[str , Field(..., description="enter your password")]

    @field_validator("email")
    @classmethod
    def check_email(cls , value):
        split_value = value.split('@')[-1]

        check_domain = ['gmail.com','yahoo.com']

        if split_value not in check_domain:
            raise ValueError("enter correct and valid email domain")
        return value