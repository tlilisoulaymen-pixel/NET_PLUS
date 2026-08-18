from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="netplus",
    version="2.0.0",
    description="NetPlus Services de Nettoyage Professionnel — ERPNext Custom App",
    author="NetPlus Inc.",
    author_email="direction@netplusinc.ca",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)
